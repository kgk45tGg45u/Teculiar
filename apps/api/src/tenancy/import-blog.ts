import { Prisma, PrismaClient } from "@prisma/client";
import { ControlPlanePrismaClient } from "./control-plane-prisma";

/**
 * One-off CLI: import BLOG content (and nothing else) from the old single-tenant Dezhost database into a
 * tenant's database — the "start fresh, blog posts only" cutover decision. Copies `Content` rows of type
 * POST with their `Translation`s, plus `BlogCategory`/`BlogTag` and the join rows, keeping original ids
 * (the target is a fresh tenant DB, so there are no collisions and re-runs are idempotent upserts).
 * `Content.authorId` is remapped to the target tenant's first admin (the FK is Restrict and the old
 * author user is NOT imported — customers/users don't carry over).
 *
 * Both databases share the same Prisma schema (the tenant schema is unchanged from single-tenant days),
 * so one generated client serves both connections.
 *
 * Run inside the API container (CONTROL_PLANE_DATABASE_URL comes from its env):
 *   docker compose exec api node apps/api/dist/tenancy/import-blog.js \
 *     "mysql://user:pw@host.docker.internal:3306/old_dezhost_db" dezhost
 *
 * ⚠️ Images are NOT copied by this script — blog bodies reference /uploads/... paths, so the operator
 * must also copy the old uploads files into the new stack's uploads volume (printed as a reminder).
 */
async function main(): Promise<void> {
  const [sourceUrl, targetSubdomain] = process.argv.slice(2);
  if (!sourceUrl || !targetSubdomain) {
    console.error('usage: node apps/api/dist/tenancy/import-blog.js "<source-db-url>" <target-subdomain>');
    process.exit(1);
  }
  if (!process.env.CONTROL_PLANE_DATABASE_URL) {
    console.error("CONTROL_PLANE_DATABASE_URL is not set — cannot resolve the target tenant.");
    process.exit(1);
  }

  const controlPlane = new ControlPlanePrismaClient();
  const tenant = await controlPlane.tenant.findUnique({ where: { subdomain: targetSubdomain } });
  if (!tenant) {
    console.error(`No tenant with subdomain "${targetSubdomain}". Provision it first (bootstrap-tenant).`);
    process.exit(1);
  }

  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient({ datasourceUrl: tenant.dbUrl });
  try {
    // The Restrict FK target for every imported post: the tenant's first admin user.
    const admin = await target.user.findFirst({
      where: { userRoles: { some: { role: { slug: "admin" } } } },
      orderBy: { createdAt: "asc" }
    });
    if (!admin) {
      console.error(`Target tenant "${targetSubdomain}" has no admin user to own the posts — aborting.`);
      process.exit(1);
    }

    const [categories, tags, posts] = await Promise.all([
      source.blogCategory.findMany(),
      source.blogTag.findMany(),
      source.content.findMany({
        where: { type: "POST" },
        include: { translations: true, blogCategories: true, blogTags: true }
      })
    ]);
    console.log(`Source: ${posts.length} posts, ${categories.length} categories, ${tags.length} tags.`);

    // Order matters for FKs: categories/tags → posts → translations → join rows. Original ids kept.
    await target.blogCategory.createMany({ data: categories, skipDuplicates: true });
    await target.blogTag.createMany({ data: tags, skipDuplicates: true });

    let translations = 0;
    for (const post of posts) {
      const { translations: postTranslations, blogCategories, blogTags, ...row } = post;
      // Read rows type Json fields as JsonValue; write inputs want InputJsonValue — cast is safe here.
      const postData = { ...row, authorId: admin.id, content: row.content as Prisma.InputJsonValue };
      await target.content.upsert({ where: { id: row.id }, update: postData, create: postData });
      for (const translation of postTranslations) {
        const translationData = { ...translation, content: translation.content as Prisma.InputJsonValue };
        await target.translation.upsert({
          where: { id: translation.id },
          update: translationData,
          create: translationData
        });
        translations += 1;
      }
      if (blogCategories.length > 0) {
        await target.contentCategory.createMany({ data: blogCategories, skipDuplicates: true });
      }
      if (blogTags.length > 0) {
        await target.contentTag.createMany({ data: blogTags, skipDuplicates: true });
      }
    }

    console.log(
      `\n✅ Imported into "${targetSubdomain}": ${posts.length} posts (author → ${admin.email}), ` +
        `${translations} translations, ${categories.length} categories, ${tags.length} tags.\n` +
        `\n⚠️ REMINDER: copy the blog image FILES too — post bodies reference /uploads/... paths.\n` +
        `   docker run --rm -v <old_uploads_volume>:/from -v <new_uploads_volume>:/to \\\n` +
        `     alpine sh -c 'cp -an /from/. /to/'   # -n = never overwrite existing files\n`
    );
  } finally {
    await Promise.all([
      source.$disconnect().catch(() => undefined),
      target.$disconnect().catch(() => undefined),
      controlPlane.$disconnect().catch(() => undefined)
    ]);
  }
}

main().catch((error) => {
  console.error("\n❌ Blog import failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
