# Folder Structure

```text
.
├── apps
│   ├── api
│   │   ├── src
│   │   │   ├── common
│   │   │   │   ├── decorators
│   │   │   │   ├── guards
│   │   │   │   └── middleware
│   │   │   ├── modules
│   │   │   │   ├── auth
│   │   │   │   ├── billing
│   │   │   │   │   └── processors
│   │   │   │   ├── cms
│   │   │   │   ├── external
│   │   │   │   ├── prisma
│   │   │   │   ├── products
│   │   │   │   ├── tickets
│   │   │   │   └── users
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web
│       ├── app
│       │   ├── [locale]
│       │   │   ├── blog
│       │   │   ├── contact
│       │   │   ├── domains
│       │   │   ├── hosting
│       │   │   ├── pricing
│       │   │   └── vps
│       │   ├── admin
│       │   ├── client
│       │   ├── globals.css
│       │   └── layout.tsx
│       ├── components
│       │   ├── admin
│       │   ├── layout
│       │   ├── marketing
│       │   ├── portal
│       │   └── ui
│       ├── lib
│       ├── store
│       ├── middleware.ts
│       ├── next.config.mjs
│       ├── package.json
│       └── tsconfig.json
├── docs
│   ├── api-endpoints.md
│   ├── architecture.md
│   └── folder-structure.md
├── packages
│   └── shared
│       └── src
├── prisma
│   └── schema.prisma
├── docker-compose.yml
├── package.json
├── README.md
└── tsconfig.base.json
```
