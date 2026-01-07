import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, X, Upload } from 'lucide-react';

interface VenueEditFormProps {
  venue: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function VenueEditForm({ venue, onSuccess, onCancel }: VenueEditFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [images, setImages] = useState<string[]>(['']);
  const [amenities, setAmenities] = useState<string[]>(['']);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    location: '',
    contact_email: '',
    contact_phone: '',
    latitude: '',
    longitude: '',
    default_opening_time: '06:00',
    default_closing_time: '22:00',
    is_active: true,
  });

  useEffect(() => {
    if (venue) {
      setFormData({
        name: venue.name || '',
        description: venue.description || '',
        address: venue.address || '',
        city: venue.city || '',
        state: venue.state || '',
        zip_code: venue.zip_code || '',
        location: venue.location || '',
        contact_email: venue.contact_email || '',
        contact_phone: venue.contact_phone || '',
        latitude: venue.latitude?.toString() || '',
        longitude: venue.longitude?.toString() || '',
        default_opening_time: venue.default_opening_time?.substring(0, 5) || '06:00',
        default_closing_time: venue.default_closing_time?.substring(0, 5) || '22:00',
        is_active: venue.is_active ?? true,
      });
      setImages(venue.images?.length > 0 ? venue.images : ['']);
      setAmenities(venue.amenities?.length > 0 ? venue.amenities : ['']);
    }
  }, [venue]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  }

  function handleImageChange(index: number, value: string) {
    const newImages = [...images];
    newImages[index] = value;
    setImages(newImages);
  }

  function addImageField() {
    setImages([...images, '']);
  }

  function removeImageField(index: number) {
    setImages(images.filter((_, i) => i !== index));
  }

  function handleAmenityChange(index: number, value: string) {
    const newAmenities = [...amenities];
    newAmenities[index] = value;
    setAmenities(newAmenities);
  }

  function addAmenityField() {
    setAmenities([...amenities, '']);
  }

  function removeAmenityField(index: number) {
    setAmenities(amenities.filter((_, i) => i !== index));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, index: number) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `venue-${venue.id}-${Date.now()}.${fileExt}`;
      const filePath = `venue-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('review-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('review-images')
        .getPublicUrl(filePath);

      handleImageChange(index, publicUrl);
      toast({ title: 'Success', description: 'Image uploaded successfully' });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(false);
    }
  }

  function validateTimes(): boolean {
    const opening = formData.default_opening_time;
    const closing = formData.default_closing_time;
    
    if (opening >= closing) {
      toast({
        title: 'Invalid Time',
        description: 'Closing time must be after opening time',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!validateTimes()) return;
    
    setLoading(true);

    try {
      const filteredImages = images.filter(img => img.trim() !== '');
      const filteredAmenities = amenities.filter(am => am.trim() !== '');

      const updateData = {
        name: formData.name,
        description: formData.description || null,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        location: formData.location,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        default_opening_time: formData.default_opening_time,
        default_closing_time: formData.default_closing_time,
        is_active: formData.is_active,
        images: filteredImages.length > 0 ? filteredImages : null,
        amenities: filteredAmenities.length > 0 ? filteredAmenities : null,
      };

      const { error } = await supabase
        .from('venues')
        .update(updateData)
        .eq('id', venue.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Venue updated successfully',
      });
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="name">Venue Name *</Label>
          <Input
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <Label htmlFor="location">Location Display Name *</Label>
          <Input
            id="location"
            name="location"
            required
            value={formData.location}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="address">Address *</Label>
          <Input
            id="address"
            name="address"
            required
            value={formData.address}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            name="city"
            required
            value={formData.city}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="state">State *</Label>
          <Input
            id="state"
            name="state"
            required
            value={formData.state}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <Label htmlFor="zip_code">Zip Code *</Label>
          <Input
            id="zip_code"
            name="zip_code"
            required
            value={formData.zip_code}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="contact_email">Contact Email</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            value={formData.contact_email}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <Label htmlFor="contact_phone">Contact Phone</Label>
          <Input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            value={formData.contact_phone}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="latitude">Latitude (Optional)</Label>
          <Input
            id="latitude"
            name="latitude"
            type="number"
            step="any"
            value={formData.latitude}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <Label htmlFor="longitude">Longitude (Optional)</Label>
          <Input
            id="longitude"
            name="longitude"
            type="number"
            step="any"
            value={formData.longitude}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="default_opening_time">Default Opening Time *</Label>
          <Input
            id="default_opening_time"
            name="default_opening_time"
            type="time"
            required
            value={formData.default_opening_time}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <Label htmlFor="default_closing_time">Default Closing Time *</Label>
          <Input
            id="default_closing_time"
            name="default_closing_time"
            type="time"
            required
            value={formData.default_closing_time}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
        <Label htmlFor="is_active">Venue is Active</Label>
      </div>

      <div>
        <Label>Venue Images</Label>
        <div className="space-y-3 mt-2">
          {images.map((img, index) => (
            <div key={index} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={img}
                  onChange={(e) => handleImageChange(index, e.target.value)}
                  placeholder="Image URL or upload below"
                  className="flex-1"
                />
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, index)}
                    disabled={uploadingImage}
                  />
                  <Button type="button" variant="outline" size="icon" disabled={uploadingImage} asChild>
                    <span>
                      {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </span>
                  </Button>
                </label>
                {images.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeImageField(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {img && (
                <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                  <img
                    src={img}
                    alt={`Venue ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addImageField} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Another Image
          </Button>
        </div>
      </div>

      <div>
        <Label>Amenities</Label>
        <div className="space-y-2 mt-2">
          {amenities.map((amenity, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={amenity}
                onChange={(e) => handleAmenityChange(index, e.target.value)}
                placeholder="e.g., Parking, WiFi, Showers"
                className="flex-1"
              />
              {amenities.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeAmenityField(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addAmenityField} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Amenity
          </Button>
        </div>
      </div>

      <div className="flex gap-4 pt-4 border-t">
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Venue
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
