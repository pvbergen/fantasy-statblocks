import {
    App,
    ButtonComponent,
    Modal,
    TFile,
    getFrontMatterInfo,
    parseYaml,
    stringifyYaml
} from "obsidian";

import { MarkdownRenderChild } from "obsidian";
import type { Item, ItemblockParameters, Trait } from "../../index";

import type StatBlockPlugin from "src/main";

import fastCopy from "fast-copy";
import type {
    CollapseItem,
    GroupItem,
    IfElseItem,
    InlineItem,
    JavaScriptItem,
    Layout,
    LayoutItem,
    StatblockItem
} from "src/layouts/layout.types";
import { append } from "src/util/util";
import { Linkifier } from "src/parser/linkify";
import { Itemary } from "src/itemary/itemary";
import copy from "fast-copy";
import { confirmWithModal } from "./statblock";
import Itemblock from "./Itemblock.svelte";

type RendererParameters = {
    container: HTMLElement;
    plugin: StatBlockPlugin;
    context?: string;
    layout?: Layout;
} & (
    | {
          item: Item;
      }
    | {
          params: Partial<ItemblockParameters>;
      }
);

export default class ItemBlockRenderer extends MarkdownRenderChild {
    topBar!: HTMLDivElement;
    bottomBar!: HTMLDivElement;
    loaded: boolean = false;
    statblockEl!: HTMLDivElement;
    contentEl!: HTMLDivElement;
    container: HTMLElement;
    item!: Item;
    plugin: StatBlockPlugin;
    params!: Partial<ItemblockParameters>;
    context: string;
    layout!: Layout;
    constructor(
        public rendererParameters: RendererParameters,
        public icons = true
    ) {
        super(rendererParameters.container);

        this.container = rendererParameters.container;
        this.plugin = rendererParameters.plugin;
        this.context = rendererParameters.context ?? "";

        this.setItem(rendererParameters);

        this.setLayout();

        this.init();
    }
    setLayout() {
        this.layout =
            this.rendererParameters.layout ??
            this.plugin.itemManager
                .getAllLayouts()
                .find(
                    (layout) =>
                        layout.name ==
                            (this.params.layout ?? this.item.layout) ||
                        layout.name ==
                            (this.params.statblock ?? this.item.statblock)
                ) ??
            this.plugin.itemManager.getDefaultLayout();
    }
    get canSave() {
        return "name" in this.params;
    }

    async build(): Promise<Item> {
        let built: Partial<Item> = Object.assign(
            {},
            this.item ?? {},
            this.params ?? {}
        );

        if (!Object.values(built).length) {
            built = Object.assign({}, built, {
                note: this.context
            });
        }
        if (built.note) {
            const note = Array.isArray(built.note)
                ? (<string[]>built.note).flat(Infinity).pop()
                : built.note;
            const file =
                await this.plugin.app.metadataCache.getFirstLinkpathDest(
                    `${note}`,
                    this.context ?? ""
                );
            if (file && file instanceof TFile) {
                const info = getFrontMatterInfo(
                    await this.plugin.app.vault.cachedRead(file)
                );
                if (info.exists) {
                    Object.assign(
                        built,
                        fastCopy(
                            parseYaml(
                                Linkifier.transformYamlSource(info.frontmatter)
                            ) ?? {}
                        ),
                        this.params
                    );
                }
            }
        }
        if ("image" in built) {
            if (Array.isArray(built.image)) {
                built.image = built.image.flat(2).join("");
            }
        }

        const extensions = Itemary.getExtensions(built, new Set());
        /**
         * At this point, the built creature has been fully resolved from all
         * extensions and in-memory creature definitions.
         */
        for (const extension of extensions.reverse()) {
            built = Object.assign(built, extension);
        }
        built = Object.assign(built, this.item ?? {}, this.params ?? {});

        /**
         * Traits logic:
         * Defined in Params: ALWAYS SHOW
         * then, defined in memory
         * then, defined via extension
         *
         * Traits defined using `trait+: ...` will always just add to the underlying trait.
         */

        for (const block of this.unwrapBlocks(this.layout.blocks)) {
            if (!("properties" in block)) continue;
            for (let property of block.properties) {
                /** Ignore properties that aren't in the final built creature. */
                if (
                    !(property in built) &&
                    !(`${property}+` in built) &&
                    !(`${property}-` in built)
                ) {
                    continue;
                }
                switch (block.type) {
                    case "traits": {
                        /**
                         * Traits can be defined directly, as additive (+) or subtractive (-).
                         *
                         * Directly defined traits can be overidden by name up the extension tree.
                         * Parameters > `creature` > `extends`
                         * Directly defined parameter traits are *always shown*.
                         *
                         * Additive traits are *always* displayed, no matter where they originate.
                         *
                         * Subtractive traits are *always* removed, unless the trait is directly defined in the parameters.
                         * Subtractive traits only work on directly defined traits.
                         *
                         */
                        const $TRAIT_MAP: Map<string, Trait> = new Map();
                        const $ADDITIVE_TRAITS: Trait[] = [];

                        /**
                         * Resolve extension traits first.
                         */
                        for (const creature of [...extensions]) {
                            /**
                             * Deleted traits. These are always removed.
                             */
                            for (const trait of getTraitsList(
                                `${property}-` as keyof Item,
                                creature
                            )) {
                                $TRAIT_MAP.delete(trait.name);
                            }
                            /**
                             * Directly defined traits.
                             *
                             * Because these can be overridden, they go into a map by name.
                             */
                            for (const trait of getTraitsList(
                                property,
                                creature
                            )) {
                                $TRAIT_MAP.set(trait.name, trait);
                            }

                            /**
                             * Additive traits. These traits are always shown.
                             */
                            for (const trait of getTraitsList(
                                `${property}+` as keyof Item,
                                creature
                            )) {
                                $ADDITIVE_TRAITS.push(trait);
                            }
                        }
                        Object.assign(built, {
                            [property]: [
                                ...$TRAIT_MAP.values(),
                                ...$ADDITIVE_TRAITS
                            ]
                        });
                        break;
                    }
                    case "saves": {
                        /** TODO: Reimplement combinatorial saves */
                        let saves: {
                            [x: string]: any;
                        }[] =
                            (built[property] as {
                                [x: string]: any;
                            }[]) ?? [];
                        if (
                            property in built &&
                            !Array.isArray(built[property]) &&
                            typeof built[property] == "object"
                        ) {
                            saves = Object.entries(built[property] ?? {}).map(
                                ([key, value]) => {
                                    return { [key]: value };
                                }
                            );
                        }
                        Object.assign(built, {
                            [property]: saves
                        });
                        let additive: {
                            [x: string]: any;
                        }[] = [];
                        if (
                            `${property}+` in built &&
                            !Array.isArray(
                                built[`${property}+` as keyof Item]
                            ) &&
                            typeof built[`${property}+` as keyof Item] ==
                                "object"
                        ) {
                            additive = Object.entries(
                                built[property] ?? {}
                            ).map(([key, value]) => {
                                return { [key]: value };
                            });
                        }
                        if (additive.length) {
                            Object.assign(built, {
                                [property]: append(
                                    built[property] as { [x: string]: any }[],
                                    additive
                                )
                            });
                        }
                        break;
                    }
                    default: {
                        if (`${property}+` in built && property in built) {
                            const additive = append(
                                built[property] as string | any[],
                                built[`${property}+` as keyof Item] as
                                    | string
                                    | any[]
                            );
                            if (additive) {
                                Object.assign(built, {
                                    [property]: additive
                                });
                            }
                        }
                    }
                }
            }
        }

        built = this.transformLinks(built);

        if ("image" in built && Array.isArray(built.image)) {
            built.image = built.image.flat(2).join("");
        }

        return built as Item;
    }

    /**
     * This is used to return a list of "saves" or "traits" block in the layout.
     */
    unwrapBlocks(
        blocks: StatblockItem[]
    ): Exclude<
        StatblockItem,
        | GroupItem
        | InlineItem
        | IfElseItem
        | JavaScriptItem
        | CollapseItem
        | LayoutItem
    >[] {
        let ret: Exclude<
            StatblockItem,
            | GroupItem
            | InlineItem
            | IfElseItem
            | JavaScriptItem
            | CollapseItem
            | LayoutItem
        >[] = [];
        for (const block of blocks) {
            switch (block.type) {
                case "group":
                case "inline":
                case "collapse": {
                    ret.push(...this.unwrapBlocks(block.nested));
                    break;
                }
                case "layout":
                case "ifelse":
                case "javascript": {
                    continue;
                }
                default:
                    ret.push(block);
                    break;
            }
        }

        return ret;
    }

    setItem(
        params:
            | {
                  item: Item;
              }
            | {
                  params: Partial<ItemblockParameters>;
              }
    ) {
        if ("params" in params) {
            this.params = params.params;
            this.item = Object.assign(
                {},
                Itemary.get(this.params.item) ??
                    Itemary.get(this.params.creature)
            );
        } else {
            this.params = {};
            this.item = params.item;
        }
    }

    $ui!: Itemblock;
    async init() {
        this.containerEl.empty();
        this.item = (await this.build()) as Item;
        this.$ui = new Itemblock({
            target: this.containerEl,
            props: {
                context: this.context,
                item: this.item,
                statblock: this.layout.blocks,
                layout: this.layout,
                plugin: this.plugin,
                renderer: this,
                canSave: this.canSave,
                icons: this.icons ?? true
            }
        });
        this.$ui.$on("save", async () => {
            if (
                Itemary.hasItem(this.item.name) &&
                !(await confirmWithModal(
                    this.plugin.app,
                    "This will overwrite an existing item in settings. Are you sure?"
                ))
            )
                return;
            this.plugin.saveItem({
                ...fastCopy(this.item),
                source: this.item.source ?? "Homebrew",
                layout: this.layout.name
            } as Item);
        });

        this.$ui.$on("export", () => {
            this.plugin.exportAsPng(
                this.item.name,
                this.containerEl.firstElementChild!
            );
        });

        let extensionNames = Itemary.getExtensionNames(
            this.item,
            new Set()
        );
        this.plugin.registerEvent(
            this.plugin.app.workspace.on(
                "fantasy-statblocks:itemary:item-added",
                async (creature) => {
                    if (extensionNames.includes(creature.name)) {
                        this.item = copy(creature);
                        this.item = await this.build();
                        this.$ui.$set({ item: this.item });
                    }
                }
            )
        );
    }
    transformLinks(item: Partial<Item>): Partial<Item> {
        const built = parseYaml(
            Linkifier.transformYamlSource(
                stringifyYaml(item).replace(/\\#/g, "#")
            )
        );
        return built;
    }
}

function getTraitsList(
    property: keyof Item,
    obj: Partial<Item>
): Trait[] {
    const traitArray: Trait[] = [];
    if (property in obj && Array.isArray(obj[property])) {
        for (const trait of obj[property] as any[]) {
            if (
                !Array.isArray(trait) &&
                typeof trait == "object" &&
                "name" in trait
            ) {
                traitArray.push(trait);
            }
            if (Array.isArray(trait) && trait.length >= 1) {
                traitArray.push({
                    name: trait[0],
                    desc: trait.slice(1).join("")
                });
            }
        }
    }
    return traitArray;
}
