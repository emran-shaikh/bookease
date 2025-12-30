-- Add specific_date column to pricing_rules for date-specific pricing
ALTER TABLE public.pricing_rules 
ADD COLUMN specific_date date NULL;

-- Add index for efficient date lookups
CREATE INDEX idx_pricing_rules_specific_date ON public.pricing_rules(specific_date) WHERE specific_date IS NOT NULL;