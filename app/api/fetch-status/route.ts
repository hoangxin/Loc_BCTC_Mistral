import { readStatus } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(readStatus());
}
