import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, X, Upload, Image as ImageIcon } from 'lucide-react';

interface CourtEditFormProps {
  court: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CourtEditForm({ court, onSuccess, onCancel }: CourtEditFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [images, setImages] = useState<string[]>(['']);
  const [amenities, setAmenities] = useState<string[]>(['']);
  const [formData, setFormData] = useState({
    name: '',
    sport_type: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    location: '',
    base_price: '',
    latitude: '',
    longitude: '',
    is_active: true,
  });

  useEffect(() => {
    if (court) {
      setFormData({
        name: court.name || '',
        sport_type: court.sport_type || '',
        description: court.description || '',
        address: court.address || '',
        city: court.city || '',
        state: court.state || '',
        zip_code: court.zip_code || '',
        location: court.location || '',
        base_price: court.base_price?.toString() || '',
        latitude: court.latitude?.toString() || '',
        longitude: court.longitude?.toString() || '',
        is_active: court.is_active ?? true,
      });
      setImages(court.images?.length > 0 ? court.images : ['']);
      setAmenities(court.amenities?.length > 0 ? court.amenities : ['']);
    }
  }, [court]);

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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
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
      const fileName = `${court.id}-${Date.now()}.${fileExt}`;
      const filePath = `court-images/${fileName}`;

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const filteredImages = images.filter(img => img.trim() !== '');
      const filteredAmenities = amenities.filter(am => am.trim() !== '');

      const { error } = await supabase
        .from('courts')
        .update({
          name: formData.name,
          sport_type: formData.sport_type,
          description: formData.description || null,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zip_code,
          location: formData.location,
          base_price: parseFloat(formData.base_price),
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          images: filteredImages.length > 0 ? filteredImages : null,
          amenities: filteredAmenities.length > 0 ? filteredAmenities : null,
          is_active: formData.is_active,
        })
        .eq('id', court.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Court updated successfully',
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
          <Label htmlFor="name">Court Name *</Label>
          <Input
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <Label htmlFor="sport_type">Sport Type *</Label>
          <Input
            id="sport_type"
            name="sport_type"
            required
            value={formData.sport_type}
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
        <div>
          <Label htmlFor="base_price">Base Price (Rs./hour) *</Label>
          <Input
            id="base_price"
            name="base_price"
            type="number"
            step="0.01"
            required
            value={formData.base_price}
            onChange={handleInputChange}
          />
        </div>
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

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
        <Label htmlFor="is_active">Court is Active</Label>
      </div>

      <div>
        <Label>Court Images</Label>
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
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addImageField}>
            <Plus className="h-4 w-4 mr-1" />
            Add Image
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
                placeholder="e.g., Parking, Lighting, Locker Rooms"
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
          <Button type="button" variant="outline" size="sm" onClick={addAmenityField}>
            <Plus className="h-4 w-4 mr-1" />
            Add Amenity
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </form>
  );
}
