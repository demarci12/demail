import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactFields } from "../fields";
import { createContact } from "../actions";

export default async function NewContact({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-xl">
      <PageHeader title="Add contact" />
      <Card>
        <form action={createContact} className="flex flex-col gap-3">
          {error && <Alert>{error}</Alert>}
          <ContactFields />
          <Button type="submit">Create contact</Button>
        </form>
      </Card>
    </div>
  );
}
