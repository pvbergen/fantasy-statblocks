import type { Item } from "../../index";
import { renderMatches, type FuzzyMatch } from "obsidian";
import { FuzzyInputSuggest } from "@javalent/utilities";
import { stringify } from "./util";

export class ItemSuggestionModal extends FuzzyInputSuggest<Item> {
    field: keyof Item = "name";
    getItemText(item: Item): string {
        return stringify(item[this.field]);
    }
    renderNote(noteEL: HTMLElement, result: FuzzyMatch<Item>): void {
        const { item, match } = result;
        renderMatches(noteEL, stringify(item.source), match.matches);
    }
    renderTitle(titleEl: HTMLElement, result: FuzzyMatch<Item>): void {
        const { item, match } = result;
        renderMatches(titleEl, stringify(item.name), match.matches);
    }
}
