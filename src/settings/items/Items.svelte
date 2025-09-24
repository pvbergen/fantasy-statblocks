<script lang="ts">
    import { Itemary } from "src/itemary/itemary";
    import Pagination from "../Pagination.svelte";
    import ItemEntry from "./ItemEntry.svelte";
    import type StatBlockPlugin from "src/main";
    import { setContext } from "../layout/context";
    import Filters from "./filters/Filters.svelte";
    import { NONE, NameFilter, SourcesFilter } from "./filters/filters";
    import { prepareSimpleSearch } from "obsidian";
    import type { Item } from "index";
    import { derived, writable } from "svelte/store";
    import { onDestroy } from "svelte";
    import { confirmWithModal } from "src/view/statblock";

    export let plugin: StatBlockPlugin;

    setContext("plugin", plugin);

    export let backgroundColor: string;
    export let paddingTop: string;

    const items = writable(Itemary.getItemaryItems());
    let ref = Itemary.onSortedBy("name", (values) => {
        $items = values;
    });

    onDestroy(() => {
        ref();
    });

    const slice = writable(50);
    const page = writable(1);
    const filtered = derived(
        [items, NameFilter, SourcesFilter],
        ([items, name, sources]) => {
            let toConsider: Item[] = [];
            for (const item of items) {
                let should = true;
                if (name.length) {
                    const search = prepareSimpleSearch(name);
                    if (!search(item.name)) {
                        should = false;
                    }
                }
                if (
                    sources.length &&
                    ![item.source].flat().some((s) => s && sources.includes(s))
                ) {
                    should = false;
                }
                if (!item.source && sources.includes(NONE)) {
                    should = true;
                }
                if (should) {
                    toConsider.push(item);
                }
            }

            return toConsider;
        }
    );

    const remove = async () => {
        if (!$filtered.length) return;
        if (
            await confirmWithModal(
                plugin.app,
                `Are you sure you want to delete ${$filtered.length} item${$filtered.length === 1 ? "" : "s"}?`
            )
        ) {
            await plugin.deleteItems(...$filtered.map((m) => m.name));
        }
    };

    const pages = derived([slice, filtered], ([slice, filtered]) =>
        Math.ceil(filtered.length / slice)
    );
    const sliced = derived(
        [filtered, slice, page],
        ([filtered, slice, page]) => {
            return filtered.slice((page - 1) * slice, page * slice);
        }
    );
</script>

<div class="bestiary-container">
    <div
        class="filters-container"
        style="background-color: {backgroundColor}; top: -{paddingTop};"
    >
        <Filters on:remove={() => remove()} />
        <div class="setting-item-description">
            {$filtered.length ? $filtered.length : "No"} item{$filtered.length ===
            1
                ? ""
                : "s"}
        </div>
    </div>
    <div class="items-container">
        {#each $sliced as item (item.name)}
            <ItemEntry {item} on:close />
        {/each}
    </div>
    <div class="pagination-container">
        <Pagination {slice} {page} {pages} />
    </div>
</div>

<style scoped>
    .bestiary-container {
        display: flex;
        flex-flow: column;
        gap: 1rem;
    }
    .filters-container {
        display: flex;
        flex-flow: column nowrap;
        gap: 0.25rem;
    }
</style>
