GRANT EXECUTE ON FUNCTION public.create_match_post_from_booking(uuid, uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_match_post(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_match_post(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_guest_match_contact_status(uuid, public.match_guest_contact_status, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_guest_match_contact(uuid, text, text, text, uuid) TO anon, authenticated;