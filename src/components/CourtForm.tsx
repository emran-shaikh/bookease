import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';

export function CourtForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>(['']);
  const [amenities, setAmenities] = useState<string[]>(['']);
  const [is24Hours, setIs24Hours] = useState(false);
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
    opening_time: '06:00',
    closing_time: '22:00',
  });

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

  function validateTimes(): boolean {
    if (is24Hours) return true;
    
    const opening = formData.opening_time;
    const closing = formData.closing_time;
    
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
    
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to create a court',
        variant: 'destructive',
      });
      return;
    }

    if (!validateTimes()) return;

    setLoading(true);

    try {
      const filteredImages = images.filter(img => img.trim() !== '');
      const filteredAmenities = amenities.filter(am => am.trim() !== '');

      const { data, error } = await supabase.from('courts').insert({
        owner_id: user.id,
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
        opening_time: is24Hours ? '00:00' : formData.opening_time,
        closing_time: is24Hours ? '23:59' : formData.closing_time,
        status: 'pending',
      } as any).select();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Court submitted for approval',
      });

      navigate('/owner');
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
    <Card>
      <CardHeader>
        <CardTitle>Create New Court</CardTitle>
        <CardDescription>List your sports venue for booking</CardDescription>
      </CardHeader>
      <CardContent>
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
                placeholder="e.g., Downtown Tennis Court"
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
                placeholder="e.g., Tennis, Basketball"
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
              placeholder="Describe your court..."
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
                placeholder="Street address"
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
                placeholder="City"
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
                placeholder="State"
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
                placeholder="12345"
              />
            </div>
            <div>
              <Label htmlFor="base_price">Base Price ($/hour) *</Label>
              <Input
                id="base_price"
                name="base_price"
                type="number"
                step="0.01"
                required
                value={formData.base_price}
                onChange={handleInputChange}
                placeholder="50.00"
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
              placeholder="e.g., Downtown Sports Complex"
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
                placeholder="40.7128"
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
                placeholder="-74.0060"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_24_hours"
                checked={is24Hours}
                onCheckedChange={(checked) => setIs24Hours(checked === true)}
              />
              <Label htmlFor="is_24_hours" className="text-sm font-medium cursor-pointer">
                Open 24 Hours
              </Label>
            </div>
            
            {!is24Hours && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="opening_time">Opening Time *</Label>
                  <Input
                    id="opening_time"
                    name="opening_time"
                    type="time"
                    required
                    value={formData.opening_time}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label htmlFor="closing_time">Closing Time *</Label>
                  <Input
                    id="closing_time"
                    name="closing_time"
                    type="time"
                    required
                    value={formData.closing_time}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Image URLs</Label>
            <div className="space-y-2 mt-2">
              {images.map((img, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={img}
                    onChange={(e) => handleImageChange(index, e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
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

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit for Approval'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
