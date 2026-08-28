import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

// Recruiter-authored reusable email templates for the candidate-page Email
// composer (migration 059). category matches the composer mode; 'general' shows
// in every mode. visibility 'team' (default) or 'private'. RLS lets anyone on
// the team read team templates and only the author edit/delete.

export type TemplateCategory = "job_spec" | "client" | "general";
export type TemplateVisibility = "team" | "private";

export type EmailTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  subject: string | null;
  body: string;
  visibility: TemplateVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const KEY = ["email-templates"];

export function useEmailTemplates() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id, name, category, subject, body, visibility, created_by, created_at, updated_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as EmailTemplate[];
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (t: {
      name: string;
      category: TemplateCategory;
      subject: string | null;
      body: string;
      visibility: TemplateVisibility;
    }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await supabase.from("email_templates").insert({ ...t, created_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      id: string;
      name?: string;
      category?: TemplateCategory;
      subject?: string | null;
      body?: string;
      visibility?: TemplateVisibility;
    }) => {
      const { id, ...patch } = t;
      const { error } = await supabase.from("email_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
