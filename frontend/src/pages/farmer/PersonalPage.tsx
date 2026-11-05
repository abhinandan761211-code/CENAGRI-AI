import FarmerShell from "@/components/farm/FarmerShell";
import PersonalDetailsForm from "@/components/account/PersonalDetailsForm";

/**
 * Personal Information — the farmer's view of the shared details editor.
 *
 * The form itself lives in `PersonalDetailsForm` so every other account type
 * (buyer, retailer, worker, transporter, warehouse, equipment owner, employer)
 * can edit the same `profiles` fields inside its own shell. Keeping the farmer
 * on the identical component means there is one save path, not eight.
 */
export default function PersonalPage() {
  return <PersonalDetailsForm frame={(page) => <FarmerShell>{page}</FarmerShell>} />;
}
