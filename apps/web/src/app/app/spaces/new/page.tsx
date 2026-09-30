import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateSpaceForm } from '../../../../components/CreateSpaceForm';
import { Container, PageTitle } from '../../../../components/ui';
import { SPACE_TYPES } from '../../../../lib/space-meta';
import type { SpaceType } from '../../../../lib/types';

export const metadata: Metadata = { title: 'New space' };

export default async function NewSpacePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const initial = (SPACE_TYPES.find((t) => t.value === type)?.value ?? 'trip') as SpaceType;
  return (
    <Container className="pt-6 md:pt-10">
      <Link href="/app/spaces" className="text-[14px] font-semibold text-signal">
        ← Spaces
      </Link>
      <div className="mt-3">
        <PageTitle title="Start a space" sub="Everyone you share money with, in one place" />
      </div>
      <div className="mt-6 max-w-xl">
        <CreateSpaceForm initialType={initial} />
      </div>
    </Container>
  );
}
