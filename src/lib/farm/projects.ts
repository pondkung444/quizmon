import type {SchoolProject} from './school';
import type {GardenProject} from './garden';

// A projection only: never copies a save or retroactively claims a milestone.
export type LegacyProject = SchoolProject & {
  id: string; source: 'legacy-school' | 'legacy-garden'; catalogue_id: string;
  checkpoint: number; layout?: GardenProject['layout']; builder_id?: string | null;
};
export function legacyProjects(school: SchoolProject | null, gardens: readonly GardenProject[], userId: string): LegacyProject[] {
  return [
    ...(school ? [{...school,id:`school:${userId}`,source:'legacy-school' as const,catalogue_id:'school-1',checkpoint:0}] : []),
    ...gardens.map(g => ({...g,source:'legacy-garden' as const,catalogue_id:'garden',checkpoint:0})),
  ];
}
