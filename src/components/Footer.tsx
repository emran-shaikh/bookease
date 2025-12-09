import { Link } from "react-router-dom";
import { MapPin, Phone, Mail } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">BookedHours</h3>
            <p className="text-sm text-muted-foreground">
              Your trusted platform for booking sports courts across Pakistan.
            </p>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Contact Us</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>F-52, 1ST FLOOR, ZAIN MOBILE MALL, Tariq Rd, Karachi</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <a href="tel:+923472751351" className="hover:text-primary transition-colors">
                  +92 347 2751351
                </a>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <a href="mailto:support@bookedhours.com" className="hover:text-primary transition-colors">
                  support@bookedhours.com
                </a>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/courts" className="text-muted-foreground hover:text-primary transition-colors">
                  Browse Courts
                </Link>
              </li>
              <li>
                <Link to="/auth" className="text-muted-foreground hover:text-primary transition-colors">
                  Sign In / Register
                </Link>
              </li>
              <li>
                <Link to="/favorites" className="text-muted-foreground hover:text-primary transition-colors">
                  My Favorites
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/privacy-policy" className="text-muted-foreground hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms-conditions" className="text-muted-foreground hover:text-primary transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to="/refund-policy" className="text-muted-foreground hover:text-primary transition-colors">
                  Return/Refund Policy
                </Link>
              </li>
              <li>
                <Link to="/service-policy" className="text-muted-foreground hover:text-primary transition-colors">
                  Service Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} BookedHours. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
