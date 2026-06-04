import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Image as ImageIcon, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PaymentScreenshotUploadProps {
  bookingId: string;
  onUploadSuccess: () => void;
  existingScreenshot?: string | null;
}

export function PaymentScreenshotUpload({ 
  bookingId, 
  onUploadSuccess, 
  existingScreenshot 
}: PaymentScreenshotUploadProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const resolvePreview = async () => {
      if (!existingScreenshot) {
        setPreviewUrl(null);
        return;
      }

      if (existingScreenshot.startsWith('http://') || existingScreenshot.startsWith('https://')) {
        setPreviewUrl(existingScreenshot);
        return;
      }

      const { data, error } = await supabase.storage
        .from('payment-screenshots')
        .createSignedUrl(existingScreenshot, 60 * 30);

      if (error) {
        console.error('Failed to create signed preview URL:', error);
        setPreviewUrl(null);
        return;
      }

      setPreviewUrl(data.signedUrl);
    };

    resolvePreview();
  }, [existingScreenshot]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPG, PNG, or WebP image.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `payment-${Date.now()}.${fileExt}`;
      const filePath = `bookings/${bookingId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('payment-screenshots')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Update booking with screenshot URL
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ payment_screenshot: filePath })
        .eq('id', bookingId);

      if (updateError) throw updateError;

      const { data: signedData } = await supabase.storage
        .from('payment-screenshots')
        .createSignedUrl(filePath, 60 * 30);

      setPreviewUrl(signedData?.signedUrl ?? null);
      toast({
        title: 'Screenshot Uploaded',
        description: 'Your payment screenshot has been uploaded. The owner will verify and confirm your booking.',
      });
      onUploadSuccess();
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <ImageIcon className="h-4 w-4" />
        Payment Screenshot
      </Label>

      {previewUrl ? (
        <div className="space-y-2">
          <div className="relative rounded-lg border overflow-hidden">
            <img 
              src={previewUrl} 
              alt="Payment screenshot" 
              className="w-full max-h-48 object-contain bg-muted"
            />
            <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
              <Check className="h-3 w-3" />
              Uploaded
            </div>
          </div>
          <Label htmlFor="screenshot-replace" className="cursor-pointer">
            <div className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Click to replace screenshot
            </div>
            <Input
              id="screenshot-replace"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </Label>
        </div>
      ) : (
        <Label htmlFor="screenshot-upload" className="cursor-pointer">
          <div className={`
            border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${uploading ? 'bg-muted' : 'hover:border-primary hover:bg-accent'}
          `}>
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Uploading...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Upload Payment Screenshot</span>
                <span className="text-xs text-muted-foreground">JPG, PNG, WebP (max 5MB)</span>
              </div>
            )}
          </div>
          <Input
            id="screenshot-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </Label>
      )}
    </div>
  );
}
