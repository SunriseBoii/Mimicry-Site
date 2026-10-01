import type { CSSProperties } from 'react';
import { competenceOrder, type CompetenceId } from '../_brand/color-system';

/** D2 semantic accents shared by UI, text reveal and editorial GPU pigments. */
export const THEMES = {
 light: {paper:'#FFFFFF',ink:'#1F2329',muted:'#56606A',surface:'#F5F5F6',line:'#DADCE0',control:'#737982'},
 dark: {paper:'#0D0D0F',ink:'#FFFFFF',muted:'#B8BBC2',surface:'#18181B',line:'#37373D',control:'#888B94'},
} as const;
export const ACCENTS: Record<CompetenceId,{light:string;dark:string}> = {
 content:{light:'#435F8C',dark:'#7F93B3'},design:{light:'#745794',dark:'#A58CBD'},
 event:{light:'#AF4953',dark:'#C78085'},games:{light:'#456B54',dark:'#84A28D'},
 video:{light:'#984C78',dark:'#BA86A8'},digital:{light:'#2F6C79',dark:'#78A3AD'},
 merch:{light:'#935C45',dark:'#BF927E'},
};
export function themeProperties(theme:'light'|'dark'):CSSProperties {
 return Object.fromEntries([
  ...Object.entries(THEMES[theme]).map(([name,value])=>[`--${name}`,value]),
  ['--accent',ACCENTS.design[theme]],
  ...competenceOrder.map(id=>[`--competence-${id}`,ACCENTS[id][theme]]),
 ]) as CSSProperties;
}

/** Lighting changes only for the production editorial scene; no geometry edits. */
export const EDITORIAL_MATERIAL = {
 light:{albedo:'#5363AB',roughness:.38,metalness:.26,specular:.48,clearcoat:.13,clearcoatRoughness:.34,ambientStrength:.24,keyStrength:1.5,fillStrength:.48,rimStrength:.045,exposure:1.02},
 dark:{albedo:'#283C80',roughness:.36,metalness:.40,specular:.50,clearcoat:.12,clearcoatRoughness:.34,ambientStrength:.28,keyStrength:2.1,fillStrength:.62,rimStrength:.06,exposure:1.08},
} as const;
