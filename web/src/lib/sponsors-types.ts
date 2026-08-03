export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  url: string;
  tagline: string;
  active: boolean;
  weight: number;
  startDate?: string; // ISO date (optional)
  endDate?: string; // ISO date (optional)
}

export interface SponsorsFile {
  rotationSeconds: number;
  sponsors: Sponsor[];
}

export const DEFAULT_SPONSORS: SponsorsFile = {
  rotationSeconds: 20,
  sponsors: [],
};

export function activeSponsors(file: SponsorsFile): Sponsor[] {
  const now = Date.now();
  return file.sponsors.filter((s) => {
    if (!s.active) return false;
    if (s.startDate && new Date(s.startDate).getTime() > now) return false;
    if (s.endDate && new Date(s.endDate).getTime() < now) return false;
    return true;
  });
}
