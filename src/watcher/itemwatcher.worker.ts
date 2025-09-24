import type { Item } from "index";
import copy from "fast-copy";
import type { CachedMetadata, FrontMatterInfo } from "obsidian";
import { transformTraits } from "src/util/util";
import YAML from "yaml";
import { LinkStringifier } from "src/parser/stringifier";

interface FileDetails {
    path: string;
    basename: string;
    mtime: number;
}

interface IWorkerData {
    debug: boolean;
    queue: string[];
    file: {
        itemblock: "frontmatter" | "inline";
        content: string;
        info: FrontMatterInfo;
        file: FileDetails;
    };
    get: string;
    done: string;
    update: {
        item: Item;
        path: string;
    };
    save: void;
    read: string;
    content: {
        path: string;
        content: string;
    };
}

interface WorkerMessage<T extends keyof IWorkerData> {
    type: T;
    data: IWorkerData[T];
}

export type WorkerData<T extends keyof IWorkerData> = IWorkerData[T];

export type DebugMessage = WorkerMessage<"debug">;
export type QueueMessage = WorkerMessage<"queue">;
export type FileCacheMessage = WorkerMessage<"file">;
export type GetFileCacheMessage = WorkerMessage<"get">;
export type FinishFileMessage = WorkerMessage<"done">;
export type UpdateEventMessage = WorkerMessage<"update">;
export type SaveMessage = WorkerMessage<"save">;

const ctx: Worker = self as any;

class Parser {
    queue: string[] = [];
    parsing: boolean = false;
    debug: boolean;

    constructor() {
        //Add Files to Queue
        ctx.addEventListener("message", (event: MessageEvent<QueueMessage>) => {
            if (event.data.type == "queue") {
                this.add(...event.data.data);

                if (this.debug) {
                    console.debug(
                        `Fantasy Statblocks: Received queue message for ${event.data.data.length} paths`
                    );
                }
            }
        });
        ctx.addEventListener("message", (event: MessageEvent<DebugMessage>) => {
            if (event.data.type == "debug") {
                this.debug = event.data.data;
            }
        });
    }
    add(...paths: string[]) {
        if (this.debug) {
            console.debug(
                `Fantasy Statblocks: Adding ${paths.length} paths to queue`
            );
        }
        this.queue.push(...paths);
        if (!this.parsing) this.parse();
    }
    processContent(content: string, file: FileDetails) {
        if (this.debug)
            console.debug(`Fantasy Statblocks: Process Content: ${file.path}`);
        let itemBlock = this.findFirstStatBlock(content);
        if (itemBlock) {
            if (this.debug)
                console.debug(
                    `Fantasy Statblocks: found Statblock: ${JSON.stringify(
                        itemBlock
                    )}`
                );

            const frontmatter = LinkStringifier.transformSource(itemBlock);
            const item: Item = Object.assign(
                {},
                YAML.parse(frontmatter),
                {
                    mtime: file.mtime
                }
            );
            if (this.debug)
                console.debug(`Fantasy Statblocks: ${JSON.stringify(item)}`);
            this.processItem(item, file);
        }
    }

    findFirstStatBlock(content: string): string {
        let matches = content.match(
            /^```[^\S\r\n]*itemblock\s?\n([\s\S]+?)^```/m
        );
        if (matches) {
            return matches[1];
        }
        return null;
    }
    async parse() {
        this.parsing = true;
        while (this.queue.length) {
            const path = this.queue.shift();
            if (this.debug) {
                console.debug(
                    `Fantasy Statblocks: Parsing ${path} for statblocks (${this.queue.length} to go)`
                );
            }
            const event = await this.getFileData(path);

            if (!path.endsWith(".md")) {
                continue;
            }
            if (!event.data) continue;

            const { file, itemblock } = event.data;

            try {
                if (itemblock === "inline") {
                    //itemblock codeblock
                    this.processContent(event.data.content, file);
                } else {
                    //frontmatter
                    this.parseFrontmatter(event.data.info, file);
                }
            } catch (e) {
                console.error(
                    `There was an error parsing the Statblock in ${path}: \n\n${e.message}`
                );
            }

            ctx.postMessage<FinishFileMessage>({ type: "done", data: path });
        }
        this.parsing = false;
        ctx.postMessage<SaveMessage>({ type: "save", data: null });
    }

    async getFileData(path: string): Promise<FileCacheMessage | null> {
        return new Promise((resolve) => {
            ctx.addEventListener(
                "message",
                (event: MessageEvent<FileCacheMessage | null>) => {
                    if (event.data.type == "file") {
                        resolve(event.data);
                    }
                }
            );
            ctx.postMessage<GetFileCacheMessage>({ data: path, type: "get" });
        });
    }
    parseFrontmatter(info: FrontMatterInfo, file: FileDetails) {
        if (!info.exists) return;

        const frontmatter = LinkStringifier.transformYamlSource(
            info.frontmatter
        );

        const item: Item = this.validate(
            Object.assign({}, copy(YAML.parse(frontmatter)), {
                mtime: file.mtime
            })
        );

        if (item.traits) {
            item.traits = transformTraits([], item.traits);
        }
        this.processItem(item, file);
    }

    private processItem(item: Item, file: FileDetails) {
        if (item.actions) {
            item.actions = transformTraits([], item.actions);
        }
        if (item.bonus_actions) {
            item.bonus_actions = transformTraits([], item.bonus_actions);
        }
        if (item.reactions) {
            item.reactions = transformTraits([], item.reactions);
        }
        if (item.legendary_actions) {
            item.legendary_actions = transformTraits(
                [],
                item.legendary_actions
            );
        }
        if (
            item["itemblock-link"] &&
            item["itemblock-link"].startsWith("#")
        ) {
            item[
                "itemblock-link"
            ] = `[${item.name}](${file.path}${item["itemblock-link"]})`;
        }

        if (this.debug)
            console.debug(
                `Fantasy Statblocks: Adding ${item.name} to bestiary from ${file.basename}`
            );

        ctx.postMessage<UpdateEventMessage>({
            type: "update",
            data: { item, path: file.path }
        });
    }
    validate(draft: Partial<Item>): Item {
        return draft as Item;
    }
}
new Parser();
