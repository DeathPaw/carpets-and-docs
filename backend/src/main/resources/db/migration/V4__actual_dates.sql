ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_pickup_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_pickup_time_slot VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_delivery_time_slot VARCHAR(20);

-- Copy planned dates to actual for existing orders
UPDATE orders SET actual_pickup_date = pickup_date WHERE actual_pickup_date IS NULL AND pickup_date IS NOT NULL;
UPDATE orders SET actual_pickup_time_slot = pickup_time_slot WHERE actual_pickup_time_slot IS NULL AND pickup_time_slot IS NOT NULL;
UPDATE orders SET actual_delivery_date = delivery_date WHERE actual_delivery_date IS NULL AND delivery_date IS NOT NULL;
UPDATE orders SET actual_delivery_time_slot = delivery_time_slot WHERE actual_delivery_time_slot IS NULL AND delivery_time_slot IS NOT NULL;
