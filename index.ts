import type { API } from "src/api/api";
import type { DefaultLayout, Layout } from "src/layouts/layout.types";

export type ability =
    | "strength"
    | "dexterity"
    | "constitution"
    | "intelligence"
    | "wisdom"
    | "charisma";
export type fage_ability =
    | "accuracy"
    | "communication"
    | "constitution"
    | "dexterity"
    | "fighting"
    | "intelligence"
    | "perception"
    | "strength"
    | "willpower";

export type AbilitySkill = { [key: string]: number }
export type TraitAbilitySkill = Trait | AbilitySkill;

export interface Monster {
    image?: string;
    name: string;
    size: string;
    type: string;
    subtype: string;
    alignment: string;
    ac: string | number;
    hp: number;
    hit_dice?: string;
    speed: string;
    stats: [number, number, number, number, number, number];
    fage_stats?: [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number
    ];
    saves?: AbilitySkill | TraitAbilitySkill[];
    skillsaves?: AbilitySkill | TraitAbilitySkill[];
    damage_vulnerabilities: string;
    damage_resistances: string;
    damage_immunities: string;
    condition_immunities: string;
    senses: string;
    languages: string;
    cr: string | number;
    traits?: Trait[];
    spells?: Spell[];
    actions?: Trait[];
    bonus_actions?: Trait[];
    legendary_actions?: Trait[];
    legendary_description?: string;
    mythic_actions?: Trait[];
    mythic_description?: string;
    reactions?: Trait[];
    lair_actions?: Trait[];
    source?: string | string[];
    spellsNotes?: string;
    "statblock-link"?: string;

    /** Fate Core */
    description?: string;
    aspects?: string;
    temporaryAspects?: string;
    stress?: number[];
    consequences?: Trait[];
    skills?: Trait[];
    stunts?: Trait[];
    items?: Trait[];
    extras?: Trait[];

    /** 13th Age */
    flavor_text?: string;
    initiative?: number;
    vulnerability?: string;
    mook?: boolean;
    triggered_actions?: Trait[];
    nastier_traits?: Trait[];

    /** Statblock Parameters */
    export?: boolean;
    dice?: boolean;
    render?: boolean;
    layout?: string;
    statblock?: string;
    columns?: number;
    columnWidth?: number;
    columnHeight?: number;
    forceColumns?: boolean;

    note?: string;
    path?: string;
    mtime?: number;

    /* Extensions */

    monster?: string;
    creature?: string;
    extends?: string | string[];
    bestiary: boolean;

    [key: string]: any;
}

export interface Item {
    image?: string;
    name: string;
    size?: string;
    type: string;

    /** Statblock Parameters */
    export?: boolean;
    dice?: boolean;
    render?: boolean;
    layout?: string;
    statblock?: string;
    columns?: number;
    columnWidth?: number;
    columnHeight?: number;
    forceColumns?: boolean;

    note?: string;
    path?: string;
    mtime?: number;

    /* Extensions */
    item?: string;
    extends?: string | string[];
    itemary: boolean;

    [key: string]: any;
}

export interface ItemblockParameters
    extends Omit<
        Item,
        | "traits"
    > {
    traits?: { desc: string; name: string }[];
    feature?: Trait[];
}

export interface StatblockParameters
    extends Omit<
        Monster,
        | "traits"
        | "actions"
        | "bonus_actions"
        | "legendary_actions"
        | "reactions"
    > {
    traits?: { desc: string; name: string }[];
    actions?: Trait[];
    bonus_actions?: Trait[];
    legendary_actions?: Trait[];
    reactions?: Trait[];
}

export type Spell = string | { [key: string]: string };

export interface Trait {
    name: string;
    desc: string;
    traits?: Trait[];
    [key: string]: any;
}

export interface StatblockData {
    monsters: Array<[string, Monster]>;
    items: Array<[string, Item]>;
    statBlockLayoutSettings: LayoutSettings;
    itemBlockLayoutSettings: LayoutSettings;
    useDice: boolean;
    renderDice: boolean;
    export: boolean;
    version: {
        major: number;
        minor: number;
        patch: number;
    };
    paths: string[];
    autoParse: boolean;
    disableSRD: boolean;
    tryToRenderLinks: boolean;
    debug: boolean;
    notifiedOfFantasy: boolean;
    hideConditionHelp: boolean;
    defaultLayoutsIntegrated: boolean;
    atomicWrite: boolean;
}

export interface LayoutSettings {
    defaultLayouts: Record<string, DefaultLayout>;
    layouts: Layout[];
    default: string;
    showAdvanced: boolean;
    alwaysImport: boolean;
}

declare global {
    interface Window {
        FantasyStatblocks: API;
    }
}
