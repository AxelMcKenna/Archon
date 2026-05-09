import { CccTabClient } from "./tab-client";

export default async function CccPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CccTabClient projectId={id} />;
}
