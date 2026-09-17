import { NextResponse } from 'next/server';
import {
  getSocialConfig,
  getSanitizedSocialConfig,
  saveSocialConfig,
} from '@/lib/socialPublishers';

export async function GET() {
  try {
    const sanitized = getSanitizedSocialConfig();
    return NextResponse.json({
      success: true,
      config: sanitized,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch social configuration', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const current = getSocialConfig();

    // Helper to clean incoming updates so masked tokens don't overwrite real tokens
    const filterSecrets = (incoming, existing) => {
      if (!incoming) return {};
      const result = { ...incoming };
      const secretFields = ['clientId', 'clientSecret', 'refreshToken', 'accessToken', 'clientKey'];
      for (const [k, v] of Object.entries(result)) {
        if (typeof v === 'string') {
          // If a secret field contains a mask pattern ('...' or '****'), retain existing real secret
          if (secretFields.includes(k) && (v.includes('...') || v.includes('****'))) {
            if (existing && existing[k]) {
              result[k] = existing[k];
            }
          }
        }
      }
      return result;
    };

    const updatedConfig = {
      youtube: {
        ...current.youtube,
        ...filterSecrets(body.youtube, current.youtube),
      },
      tiktok: {
        ...current.tiktok,
        ...filterSecrets(body.tiktok, current.tiktok),
      },
      instagram: {
        ...current.instagram,
        ...filterSecrets(body.instagram, current.instagram),
      },
    };

    saveSocialConfig(updatedConfig);
    const sanitized = getSanitizedSocialConfig();

    return NextResponse.json({
      success: true,
      message: 'Social configurations saved successfully',
      config: sanitized,
    });
  } catch (error) {
    console.error('[API /api/publish/config] Error updating config:', error);
    return NextResponse.json(
      { error: 'Failed to save social configuration', details: error.message },
      { status: 500 }
    );
  }
}
