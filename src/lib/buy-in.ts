import { supabase } from "@/integrations/supabase/client";

// Shared buy-in marking logic for LogActivityModal and ActivityTimeline.
// Buy-in is a deliberate flag on one interaction, always tied to a specific job.
// Marking it: ensure a process exists for (candidate, requisition), then set
// interactions.is_buy_in + the FK links. A DB trigger (migration 061) derives
// processes.buy_in_interaction_id / buy_in_method / buy_in_confirmed_at from it.

export async function resolveOrCreateProcess(opts: {
  candidateId: string;
  requisitionId: string;
  recruiterId: string;
}): Promise<string> {
  const { candidateId, requisitionId, recruiterId } = opts;

  const { data: existing } = await supabase
    .from("processes")
    .select("id, stage")
    .eq("candidate_id", candidateId)
    .eq("requisition_id", requisitionId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    // Recording buy-in advances a still-pitching process one hop. Never skips
    // further and never touches a process already past Buy-In or terminal.
    if (existing.stage === "Specs Sent") {
      await supabase.from("processes").update({ stage: "Buy-In" }).eq("id", existing.id);
    }
    return existing.id;
  }

  // No process yet: create one at "Buy-In" -- we have consent, no CV sent.
  const { data: created, error } = await supabase
    .from("processes")
    .insert({
      candidate_id: candidateId,
      requisition_id: requisitionId,
      owner_recruiter_id: recruiterId,
      stage: "Buy-In" as const,
      coverage_type: "own" as const,
    })
    .select("id")
    .single();
  if (error || !created?.id) throw error ?? new Error("Could not create process");
  return created.id;
}

export async function markInteractionBuyIn(opts: {
  interactionId: string;
  candidateId: string;
  requisitionId: string;
  recruiterId: string;
  clientId?: string | null;
  contactId?: string | null;
}): Promise<{ processId: string }> {
  const processId = await resolveOrCreateProcess(opts);
  const patch: {
    is_buy_in: boolean;
    process_id: string;
    requisition_id: string;
    client_id?: string | null;
    contact_id?: string | null;
  } = {
    is_buy_in: true,
    process_id: processId,
    requisition_id: opts.requisitionId,
  };
  if (opts.clientId !== undefined) patch.client_id = opts.clientId;
  if (opts.contactId !== undefined) patch.contact_id = opts.contactId;
  const { error } = await supabase.from("interactions").update(patch).eq("id", opts.interactionId);
  if (error) throw error;
  return { processId };
}

export async function unmarkInteractionBuyIn(interactionId: string): Promise<void> {
  // Leave the process/requisition links; only drop the flag. The trigger clears
  // processes.buy_in_* when no is_buy_in interaction remains.
  const { error } = await supabase
    .from("interactions")
    .update({ is_buy_in: false })
    .eq("id", interactionId);
  if (error) throw error;
}
