import type { CSSProperties } from 'react';
import { competenceOrder, type CompetenceId } from '../_brand/color-system';

/** Editorial palette. GPU pigments keep the established PS-04 semantic hues. */
export const THEMES = {
 light: {paper:'#FFFFFF',ink:'#1F2329',muted:'#56606A',surface:'#F5F5F6',line:'#DADCE0',control:'#737982'},
 dark: {paper:'#0D0D0F',ink:'#FFFFFF',muted:'#B8BBC2',surface:'#18181B',line:'#37373D',control:'#888B94'},
} as const;
export const ACCENTS: Record<CompetenceId,{light:string;dark:string}> = {
 content:{light:'#354FB3',dark:'#9CADFF'},design:{light:'#6E43A9',dark:'#C3A1F3'},
 event:{light:'#B44731',dark:'#FF9A81'},games:{light:'#346C49',dark:'#8DD2A2'},
 video:{light:'#AA3977',dark:'#FFA0C6'},digital:{light:'#0B7181',dark:'#84D6E2'},
 merch:{light:'#856010',dark:'#EEC978'},
};
export function themeProperties(theme:'light'|'dark'):CSSProperties {
 return Object.fromEntries([
  ...Object.entries(THEMES[theme]).map(([name,value])=>[`--${name}`,value]),
  ...competenceOrder.map(id=>[`--competence-${id}`,ACCENTS[id][theme]]),
 ]) as CSSProperties;
}

/** Lighting changes only for the production editorial scene; no geometry edits. */
export const EDITORIAL_MATERIAL = {
 light:{albedo:'#5363AB',roughness:.38,metalness:.26,specular:.48,clearcoat:.13,clearcoatRoughness:.34,ambientStrength:.24,keyStrength:1.5,fillStrength:.48,rimStrength:.045,exposure:1.02},
 dark:{albedo:'#283C80',roughness:.36,metalness:.40,specular:.50,clearcoat:.12,clearcoatRoughness:.34,ambientStrength:.28,keyStrength:2.1,fillStrength:.62,rimStrength:.06,exposure:1.08},
} as const;
