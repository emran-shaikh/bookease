import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, X, Upload, Clock, Building2 } from 'lucide-react';
import { VenueSelector } from '@/components/VenueSelector';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Venue {
  id: string;
  name: string;
  default_opening_time: string | null;
  default_closing_time: string | null;
}

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
  const [is24Hours, setIs24Hours] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [useCustomHours, setUseCustomHours] = useState(false);
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
    opening_time: '06:00',
    closing_time: '22:00',
  });

  // Fetch venue details when venue is selected
  useEffect(() => {
    if (selectedVenueId) {
      fetchVenueDetails(selectedVenueId);
    } else {
      setSelectedVenue(null);
    }
  }, [selectedVenueId]);

  async function fetchVenueDetails(venueId: string) {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, default_opening_time, default_closing_time')
        .eq('id', venueId)
        .single();
      
      if (error) throw error;
      setSelectedVenue(data);
    } catch (error) {
      console.error('Error fetching venue:', error);
    }
  }

  useEffect(() => {
    if (court) {
      const hasTimeOverride = court.opening_time_override || court.closing_time_override;
      const openingTime = (hasTimeOverride ? court.opening_time_override : court.opening_time)?.substring(0, 5) || '06:00';
      const closingTime = (hasTimeOverride ? court.closing_time_override : court.closing_time)?.substring(0, 5) || '22:00';
      const is24 = openingTime === '00:00' && (closingTime === '23:59' || closingTime === '00:00');
      
      setIs24Hours(is24);
      setSelectedVenueId(court.venue_id || null);
      setUseCustomHours(hasTimeOverride || !court.venue_id);
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
        opening_time: openingTime,
        closing_time: closingTime,
      });
      
      // Handle images based on venue linkage
      if (court.venue_id) {
        setImages(court.court_specific_images?.length > 0 ? court.court_specific_images : ['']);
        setAmenities(court.court_specific_amenities?.length > 0 ? court.court_specific_amenities : ['']);
      } else {
        setImages(court.images?.length > 0 ? court.images : ['']);
        setAmenities(court.amenities?.length > 0 ? court.amenities : ['']);
      }
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
    
    // Only validate times if using custom hours
    if ((useCustomHours || !selectedVenueId) && !validateTimes()) return;
    
    setLoading(true);

    try {
      const filteredImages = images.filter(img => img.trim() !== '');
      const filteredAmenities = amenities.filter(am => am.trim() !== '');

      const updateData: any = {
        name: formData.name,
        sport_type: formData.sport_type,
        description: formData.description || null,
        base_price: parseFloat(formData.base_price),
        is_active: formData.is_active,
        venue_id: selectedVenueId || null,
      };

      if (selectedVenueId) {
        // Venue-linked court
        updateData.court_specific_images = filteredImages.length > 0 ? filteredImages : null;
        updateData.court_specific_amenities = filteredAmenities.length > 0 ? filteredAmenities : null;
        updateData.address = null;
        updateData.city = null;
        updateData.state = null;
        updateData.zip_code = null;
        updateData.location = null;
        updateData.images = null;
        updateData.amenities = null;
        
        // Handle operating hours override
        if (useCustomHours) {
          updateData.opening_time_override = is24Hours ? '00:00' : formData.opening_time;
          updateData.closing_time_override = is24Hours ? '23:59' : formData.closing_time;
        } else {
          updateData.opening_time_override = null;
          updateData.closing_time_override = null;
        }
        // Keep base times null for venue courts
        updateData.opening_time = null;
        updateData.closing_time = null;
      } else {
        // Standalone court
        updateData.address = formData.address;
        updateData.city = formData.city;
        updateData.state = formData.state;
        updateData.zip_code = formData.zip_code;
        updateData.location = formData.location;
        updateData.latitude = formData.latitude ? parseFloat(formData.latitude) : null;
        updateData.longitude = formData.longitude ? parseFloat(formData.longitude) : null;
        updateData.images = filteredImages.length > 0 ? filteredImages : null;
        updateData.amenities = filteredAmenities.length > 0 ? filteredAmenities : null;
        updateData.court_specific_images = null;
        updateData.court_specific_amenities = null;
        updateData.opening_time = is24Hours ? '00:00' : formData.opening_time;
        updateData.closing_time = is24Hours ? '23:59' : formData.closing_time;
        updateData.opening_time_override = null;
        updateData.closing_time_override = null;
      }

      const { error } = await supabase
        .from('courts')
        .update(updateData)
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

        <VenueSelector
          value={selectedVenueId}
          onChange={setSelectedVenueId}
        />

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

        {/* Location fields - only shown for standalone courts */}
        {!selectedVenueId && (
          <>
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
          </>
        )}

        {/* Base price for venue-linked courts */}
        {selectedVenueId && (
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
        )}

      {/* Operating Hours Section */}
      <div className="space-y-4">
        <Label className="flex items-center gap-2 text-base font-medium">
          <Clock className="h-4 w-4" />
          Operating Hours
        </Label>
        
        {selectedVenueId && selectedVenue && (
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertDescription>
              <strong>Venue Hours:</strong> {selectedVenue.default_opening_time?.substring(0, 5) || '06:00'} - {selectedVenue.default_closing_time?.substring(0, 5) || '22:00'}
              <br />
              <span className="text-muted-foreground text-sm">
                This court will inherit these hours unless you set custom hours below.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {selectedVenueId && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use_custom_hours"
              checked={useCustomHours}
              onCheckedChange={(checked) => setUseCustomHours(checked === true)}
            />
            <Label htmlFor="use_custom_hours" className="text-sm font-medium cursor-pointer">
              Use custom operating hours for this court
            </Label>
          </div>
        )}

        {(useCustomHours || !selectedVenueId) && (
          <>
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
          </>
        )}
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
        <Label>{selectedVenueId ? 'Court-Specific Images' : 'Court Images'}</Label>
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
        <Label>{selectedVenueId ? 'Court-Specific Amenities' : 'Amenities'}</Label>
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
