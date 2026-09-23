import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

// createClient()'s own default generic parameters don't line up 1:1 with the
// bare `SupabaseClient` type's defaults (a known supabase-js quirk) - using
// its actual return type instead avoids a spurious "unsafe assignment"
// between two structurally-identical-but-nominally-different instantiations.
type SupabaseClient = ReturnType<typeof createClient>;

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private adminSupabase?: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  private parseJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    try {
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payload.padEnd(
        payload.length + ((4 - (payload.length % 4)) % 4),
        '=',
      );
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  constructor() {
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'SUPABASE_URL und SUPABASE_ANON_KEY müssen in .env gesetzt werden',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Erstellt einen Supabase-Admin-Client (benoetigt Service Role Key).
   */
  getAdminClient(): SupabaseClient {
    if (this.adminSupabase) {
      return this.adminSupabase;
    }

    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen in .env gesetzt werden',
      );
    }

    const payload = this.parseJwtPayload(serviceRoleKey);
    if (payload) {
      const role = typeof payload.role === 'string' ? payload.role : 'unknown';
      const issuer = typeof payload.iss === 'string' ? payload.iss : 'unknown';
      this.logger.debug(`Service role key payload role: ${role}`);
      this.logger.debug(`Service role key issuer: ${issuer}`);
    } else {
      this.logger.warn('Service role key konnte nicht als JWT gelesen werden');
    }

    this.adminSupabase = createClient(supabaseUrl, serviceRoleKey);
    return this.adminSupabase;
  }

  /**
   * Erstellt einen Supabase-Client mit dem Access Token des Users
   * für authentifizierte Anfragen
   */
  getAuthenticatedClient(accessToken: string): SupabaseClient {
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();

    return createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
}
