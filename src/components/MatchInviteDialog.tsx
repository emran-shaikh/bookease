import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Calendar, Clock, Copy, MapPin, QrCode, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface MatchInviteDialogProps {
  matchId: string;
  courtName: string;
  venueName: string;
  cityOrLocation: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  sportType: string;
  seatsLeft: number;
}

export function MatchInviteDialog({
  matchId,
  courtName,
  venueName,
  cityOrLocation,
  matchDate,
  startTime,
  endTime,
  sportType,
  seatsLeft,
}: MatchInviteDialogProps) {
  const [open, setOpen] = useState(false);

  const inviteUrl = useMemo(() => {
    const params = new URLSearchParams({ invite: matchId, inviteCode: matchId });
    return `${window.location.origin}/matches?${params.toString()}`;
  }, [matchId]);

  const inviteMessage = useMemo(
    () =>
      `Join my ${sportType} match at ${courtName}${venueName ? ` (${venueName})` : ''} on ${matchDate}, ${startTime}-${endTime}. Open slots: ${seatsLeft}. ${inviteUrl}`,
    [sportType, courtName, venueName, matchDate, startTime, endTime, seatsLeft, inviteUrl],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleShare = async () => {
    if (!navigator.share) {
      await handleCopy();
      return;
    }

    try {
      await navigator.share({
        title: `${sportType} match invite`,
        text: inviteMessage,
        url: inviteUrl,
      });
    } catch {
      // Silent on dismiss.
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Share2 className="h-4 w-4" />
          Invite friends
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Share match invite
          </DialogTitle>
          <DialogDescription>
            Send this link or QR for instant join access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border p-3 space-y-1.5">
            <p className="font-medium">{courtName}</p>
            <p className="text-muted-foreground text-xs">{venueName} • {sportType}</p>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{cityOrLocation}</p>
              <p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{matchDate}</p>
              <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{startTime} - {endTime}</p>
            </div>
            <Badge variant="secondary" className="mt-1 text-[10px]">{seatsLeft} slots left</Badge>
          </div>

          <div className="flex items-center justify-center rounded-md border bg-muted/30 p-3">
            <QRCodeSVG value={inviteUrl} size={168} level="M" includeMargin />
          </div>

          <div className="space-y-2">
            <Input value={inviteUrl} readOnly />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
              <Button type="button" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}