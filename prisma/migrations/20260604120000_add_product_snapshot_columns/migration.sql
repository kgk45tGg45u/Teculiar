-- Add productSnapshot column to Service table (missing from baseline migration)
ALTER TABLE `Service`
  ADD COLUMN `productSnapshot` JSON NULL;

-- Add productSnapshot column to OrderItem table (missing from baseline migration)
ALTER TABLE `OrderItem`
  ADD COLUMN `productSnapshot` JSON NULL;
