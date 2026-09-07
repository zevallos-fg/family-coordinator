-- v34 F7: Create family-documents storage bucket with RLS policies
-- This migration creates the storage bucket for the Document Vault feature.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-documents',
  'family-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do nothing;

-- RLS policies for family-scoped document access
create policy "family_documents_read" on storage.objects for select using (
  bucket_id = 'family-documents'
  and (storage.foldername(name))[1] in (
    select family_id::text from family_members where user_id = auth.uid()
  )
);

create policy "family_documents_insert" on storage.objects for insert with check (
  bucket_id = 'family-documents'
  and (storage.foldername(name))[1] in (
    select family_id::text from family_members where user_id = auth.uid()
  )
);

create policy "family_documents_update" on storage.objects for update using (
  bucket_id = 'family-documents'
  and (storage.foldername(name))[1] in (
    select family_id::text from family_members where user_id = auth.uid()
  )
);

create policy "family_documents_delete" on storage.objects for delete using (
  bucket_id = 'family-documents'
  and (storage.foldername(name))[1] in (
    select family_id::text from family_members where user_id = auth.uid()
  )
);
