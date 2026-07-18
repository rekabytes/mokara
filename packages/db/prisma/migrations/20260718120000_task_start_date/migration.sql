-- Add start_date column to tasks so the UI can capture a date range (start + due).
ALTER TABLE "tasks" ADD COLUMN "start_date" TIMESTAMPTZ(3);
