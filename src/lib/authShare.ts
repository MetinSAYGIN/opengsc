import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Site } from '@/generated/prisma';

export async function verifyAuthOrShare(
  req: Request,
  siteIdOrDomain: string,
  isDomain = false
): Promise<{ userId: string; site: Site } | null> {
  const session = await getServerSession(authOptions);
  const loggedInUserId = session?.user?.id;

  const { searchParams } = new URL(req.url);
  const shareToken = searchParams.get('shareToken') ?? undefined;

  if (shareToken) {
    const site = await prisma.site.findFirst({
      where: {
        shareToken,
        shareEnabled: true,
        ...(isDomain ? { url: siteIdOrDomain } : { id: siteIdOrDomain }),
      },
    });
    if (site) {
      return { userId: site.userId, site };
    }
  }

  if (loggedInUserId) {
    const site = await prisma.site.findFirst({
      where: {
        userId: loggedInUserId,
        ...(isDomain ? { url: siteIdOrDomain } : { id: siteIdOrDomain }),
      },
    });
    if (site) {
      return { userId: loggedInUserId, site };
    }
  }

  return null;
}
