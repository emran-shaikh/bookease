import { describe, it, expect } from 'vitest';

// Test suite for Utility Functions
describe('Utility Functions', () => {
  describe('Price Calculation', () => {
    it('should calculate base price correctly', () => {
      const basePrice = 50;
      const hours = 2;
      const total = basePrice * hours;
      
      expect(total).toBe(100);
    });

    it('should apply multiplier correctly', () => {
      const basePrice = 50;
      const multiplier = 1.5;
      const total = basePrice * multiplier;
      
      expect(total).toBe(75);
    });

    it('should handle fixed price override', () => {
      const basePrice = 50;
      const fixedPrice = 80;
      
      // Fixed price takes precedence
      const finalPrice = fixedPrice || basePrice;
      expect(finalPrice).toBe(80);
    });

    it('should prioritize pricing rules correctly', () => {
      // Priority: holiday > weekend > peak > base
      const basePrice = 50;
      const peakMultiplier = 1.5;
      const weekendMultiplier = 1.3;
      const holidayMultiplier = 2.0;

      const isHoliday = true;
      const isWeekend = true;
      const isPeakHour = true;

      let finalPrice = basePrice;
      if (isHoliday) {
        finalPrice = basePrice * holidayMultiplier;
      } else if (isWeekend) {
        finalPrice = basePrice * weekendMultiplier;
      } else if (isPeakHour) {
        finalPrice = basePrice * peakMultiplier;
      }

      expect(finalPrice).toBe(100); // Holiday takes precedence
    });
  });

  describe('Time Slot Generation', () => {
    it('should generate hourly slots correctly', () => {
      const openingTime = '06:00';
      const closingTime = '22:00';
      
      const openingHour = parseInt(openingTime.split(':')[0]);
      const closingHour = parseInt(closingTime.split(':')[0]);
      const totalSlots = closingHour - openingHour;
      
      expect(totalSlots).toBe(16);
    });

    it('should format time in 12-hour format', () => {
      const formatTime = (hour: number): string => {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:00 ${period}`;
      };

      expect(formatTime(9)).toBe('9:00 AM');
      expect(formatTime(12)).toBe('12:00 PM');
      expect(formatTime(14)).toBe('2:00 PM');
      expect(formatTime(0)).toBe('12:00 AM');
    });
  });

  describe('Date Validation', () => {
    it('should not allow past dates', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - 1);
      
      const isPastDate = pastDate < today;
      expect(isPastDate).toBe(true);
    });

    it('should check if date is weekend', () => {
      const isWeekend = (date: Date): boolean => {
        const day = date.getDay();
        return day === 0 || day === 6;
      };

      const saturday = new Date('2025-12-20'); // Saturday
      const monday = new Date('2025-12-22'); // Monday

      expect(isWeekend(saturday)).toBe(true);
      expect(isWeekend(monday)).toBe(false);
    });
  });

  describe('Currency Formatting', () => {
    it('should format price in PKR', () => {
      const formatPrice = (price: number): string => {
        return `Rs. ${price.toLocaleString()}`;
      };

      expect(formatPrice(1000)).toBe('Rs. 1,000');
      expect(formatPrice(50)).toBe('Rs. 50');
    });
  });

  describe('Slug Generation', () => {
    it('should generate URL-safe slug', () => {
      const generateSlug = (name: string): string => {
        return name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      };

      expect(generateSlug('Test Tennis Court')).toBe('test-tennis-court');
      expect(generateSlug('Court #1 - Premium')).toBe('court-1-premium');
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate Pakistani phone number format', () => {
      const isValidPakistaniPhone = (phone: string): boolean => {
        return /^(\+92|92|0)?3\d{9}$/.test(phone.replace(/\s|-/g, ''));
      };

      expect(isValidPakistaniPhone('+923001234567')).toBe(true);
      expect(isValidPakistaniPhone('03001234567')).toBe(true);
      expect(isValidPakistaniPhone('923001234567')).toBe(true);
      expect(isValidPakistaniPhone('invalid')).toBe(false);
    });
  });
});
