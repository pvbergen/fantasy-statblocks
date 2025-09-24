import fastCopy from "fast-copy";
import { Notice, Setting } from "obsidian";
import { Layout5e } from "src/layouts";
import type { DefaultLayout, Layout } from "src/layouts/layout.types";
import type LayoutManager from "src/layouts/manager";
import type StatBlockPlugin from "src/main";
import FantasyStatblockModal from "src/modal/modal";
import { nanoid } from "src/util/util";
import LayoutEditor from "./layout/LayoutEditor.svelte";

export class LayoutSettings {

  constructor(private plugin: StatBlockPlugin, private manager: LayoutManager) {
  }
  generateLayouts(containerEl: HTMLDivElement) {
    containerEl.empty();
    new Setting(containerEl).setHeading().setName("Layouts");

    const statblockCreatorContainer = containerEl.createDiv(
      "statblock-additional-container"
    );
    statblockCreatorContainer
      .createDiv("setting-item")
      .createDiv()
      .appendChild(
        createFragment((el) => {
          el.createSpan({
            text: "New statblock layouts can be created and managed here. A specific layout can be used for a creature using the "
          });
          el.createEl("code", { text: "layout" });
          el.createSpan({ text: " parameter." });
        })
      );
    const importFile = new Setting(statblockCreatorContainer)
      .setName("Import From JSON")
      .setDesc("Import a custom layout from a JSON file.");
    const inputFile = createEl("input", {
      attr: {
        type: "file",
        name: "layout",
        accept: ".json",
        multiple: true
      }
    });
    inputFile.onchange = async () => {
      const { files } = inputFile;
      if (!files?.length) return;
      try {
        const { files } = inputFile;
        if (!files?.length) return;
        for (const file of Array.from(files)) {
          await new Promise<void>((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (event) => {
              try {
                const layout: Layout = JSON.parse(
                  event.target?.result as string
                );
                if (!layout) {
                  reject(
                    new Error("Invalid layout imported")
                  );
                  return;
                }
                if (!layout?.name) {
                  reject(
                    new Error(
                      "Invalid layout imported: layout does not have a name"
                    )
                  );
                  return;
                }

                if (!layout?.blocks) {
                  reject(
                    new Error(
                      "Invalid layout imported: no blocks defined in layout."
                    )
                  );
                  return;
                }
                if (!layout.diceParsing) {
                  layout.diceParsing = [];
                }

                layout.id = nanoid();

                if (
                  !this.manager.layoutSettings.alwaysImport &&
                  layout.blocks.find(
                    (b) => b.type == "javascript"
                  ) &&
                  !(await confirm(this.plugin))
                ) {
                  resolve();
                }
                this.manager.layoutSettings.layouts.push(
                  this.getDuplicate(layout)
                );
                resolve();
              } catch (e) {
                reject(e);
              }
            };
            reader.readAsText(file);
          }).catch((e) => {
            new Notice(
              `There was an error importing the layout: \n\n${e}`
            );
            console.error(e);
          });
        }
        await this.plugin.saveSettings();
        inputFile.value = "";
        this.buildCustomLayouts(layoutContainer, containerEl);
      } catch (e) { }
    };

    importFile.addButton((b) => {
      b.setIcon("upload");
      b.buttonEl.addClass("statblock-file-upload");
      b.buttonEl.appendChild(inputFile);
      b.onClick(() => inputFile.click());
    });
    new Setting(statblockCreatorContainer)
      .setName("Add New Layout")
      .addButton((b) =>
        b
          .setIcon("plus-with-circle")
          .setTooltip("Add New Layout")
          .onClick(() => {
            const modal = new CreateStatblockModal(this.plugin);
            modal.onClose = async () => {
              if (!modal.saved) return;
              const l = this.getDuplicate(modal.layout);
              this.manager.layoutSettings.layouts.push(l);
              this.manager.addLayout(l);
              await this.plugin.saveSettings();
              this.buildCustomLayouts(
                layoutContainer,
                containerEl
              );
            };
            modal.open();
          })
      );

    const statblockAdditional =
      statblockCreatorContainer.createDiv("additional");
    new Setting(statblockAdditional)
      .setName("Default Layout")
      .setDesc(
        "Change the default statblock layout used, if not specified."
      )
      .addDropdown(async (d) => {
        for (const layout of this.manager.getAllLayouts()) {
          d.addOption(layout.id, layout.name);
        }

        if (
          !this.manager.layoutSettings.default ||
          !this.manager
            .getAllLayouts()
            .find(({ id }) => id == this.manager.layoutSettings.default)
        ) {
          this.manager.layoutSettings.default = Layout5e.id;
          await this.plugin.saveSettings();
        }

        d.setValue(this.manager.layoutSettings.default ?? Layout5e.id);

        d.onChange(async (v) => {
          this.manager.layoutSettings.default = v;
          this.manager.setDefaultLayout(v);
          await this.plugin.saveSettings();
        });
      });
    new Setting(statblockAdditional)
      .setName("Show Advanced Options")
      .setDesc("Show advanced options when editing layout blocks.")
      .addToggle((t) =>
        t
          .setValue(this.manager.layoutSettings.showAdvanced)
          .onChange(async (v) => {
            this.manager.layoutSettings.showAdvanced = v;
            await this.plugin.saveSettings();
          })
      );

    const layoutContainer =
      statblockCreatorContainer.createDiv("additional");

    this.buildCustomLayouts(layoutContainer, containerEl);
  }
  getDuplicate(layout: Layout): Layout {
    if (
      !this.manager
        .getAllLayouts()
        .find((l) => l.name == layout.name)
    )
      return layout;
    const names = this.manager
      .getSortedLayoutNames()
      .filter((name) => name.contains(`${layout.name} Copy`));

    let temp = `${layout.name} Copy`;

    let name = temp;
    let index = 1;
    while (names.includes(name)) {
      name = `${temp} (${index})`;
      index++;
    }
    return {
      blocks: fastCopy(layout.blocks),
      name,
      id: nanoid()
    };
  }

  buildCustomLayouts(
    layoutContainer: HTMLDivElement,
    outerContainer: HTMLDivElement
  ) {

    layoutContainer.empty();

    if (this.manager.getAllDefaultLayouts().some((f) => f.removed)) {
      new Setting(layoutContainer)
        .setName("Restore Default Layouts")
        .addButton((b) => {
          b.setIcon("rotate-ccw").onClick(async () => {
            for (const layout of Object.values(
              this.manager.layoutSettings.defaultLayouts
            )) {
              layout.removed = false;
              if (!layout.edited) {
                delete this.manager.layoutSettings.defaultLayouts[
                  layout.id
                ];
              }
            }
            await this.plugin.saveSettings();
            this.generateLayouts(outerContainer);
          });
        });
    }
    for (const layout of this.manager.getAllDefaultLayouts()) {
      if (layout.removed) continue;

      const setting = new Setting(layoutContainer)
        .setName(layout.name)
        .addExtraButton((b) => {
          b.setIcon("pencil")
            .setTooltip("Edit")
            .onClick(() => {
              const modal = new CreateStatblockModal(
                this.plugin,
                layout
              );
              modal.onClose = async () => {
                if (!modal.saved) return;

                (modal.layout as DefaultLayout).edited = true;
                this.manager.layoutSettings.defaultLayouts[layout.id] =
                  modal.layout;

                await this.plugin.saveSettings();
                this.manager.updateDefaultLayout(
                  layout.id,
                  modal.layout
                );
                this.generateLayouts(outerContainer);
              };
              modal.open();
            });
        });
      if (layout.edited) {
        setting.addExtraButton((b) =>
          b.setIcon("undo").onClick(async () => {
            const defLayout = this.manager.defaultLayouts.find(
              ({ id }) => id == layout.id
            )!;
            delete this.manager.layoutSettings.defaultLayouts[layout.id];
            await this.plugin.saveSettings();
            this.manager.updateDefaultLayout(
              layout.id,
              defLayout
            );
            this.generateLayouts(outerContainer);
          })
        );
      }

      setting
        .addExtraButton((b) => {
          b.setIcon("duplicate-glyph")
            .setTooltip("Create Copy")
            .onClick(async () => {
              const dupe = this.getDuplicate(layout);
              this.manager.layoutSettings.layouts.push(dupe);
              await this.plugin.saveSettings();
              this.manager.addLayout(dupe);

              this.buildCustomLayouts(
                layoutContainer,
                outerContainer
              );
            });
        })
        .addExtraButton((b) => {
          b.setIcon("import-glyph")
            .setTooltip("Export as JSON")
            .onClick(() => {
              const link = createEl("a");
              const file = new Blob([JSON.stringify(layout)], {
                type: "json"
              });
              const url = URL.createObjectURL(file);
              link.href = url;
              link.download = `${layout.name}.json`;
              link.click();
              URL.revokeObjectURL(url);
            });
        })
        .addExtraButton((b) => {
          b.setIcon("trash")
            .setTooltip("Delete")
            .onClick(async () => {
              layout.removed = true;
              this.manager.layoutSettings.defaultLayouts[layout.id] =
                layout;
              await this.plugin.saveSettings();
              this.generateLayouts(outerContainer);
            });
        });
    }
    for (const layout of this.manager.layoutSettings.layouts) {
      new Setting(layoutContainer)
        .setName(layout.name)
        .addExtraButton((b) => {
          b.setIcon("pencil")
            .setTooltip("Edit")
            .onClick(() => {
              const modal = new CreateStatblockModal(
                this.plugin,
                layout
              );
              modal.onClose = async () => {
                if (!modal.saved) return;
                if (
                  this.manager.defaultLayouts.find(
                    ({ id }) => id == layout.id
                  )
                ) {
                  (modal.layout as DefaultLayout).edited =
                    true;
                }
                this.manager.layoutSettings.layouts.splice(
                  this.manager.layoutSettings.layouts.indexOf(
                    layout
                  ),
                  1,
                  modal.layout
                );

                await this.plugin.saveSettings();
                this.manager.updateLayout(
                  layout.id,
                  modal.layout
                );
                this.generateLayouts(outerContainer);
              };
              modal.open();
            });
        })
        .addExtraButton((b) => {
          b.setIcon("duplicate-glyph")
            .setTooltip("Create Copy")
            .onClick(async () => {
              const dupe = this.getDuplicate(layout);
              this.manager.layoutSettings.layouts.push(dupe);
              await this.plugin.saveSettings();
              this.manager.addLayout(dupe);
              this.buildCustomLayouts(
                layoutContainer,
                outerContainer
              );
            });
        })
        .addExtraButton((b) => {
          b.setIcon("import-glyph")
            .setTooltip("Export as JSON")
            .onClick(() => {
              const link = createEl("a");
              const file = new Blob([JSON.stringify(layout)], {
                type: "json"
              });
              const url = URL.createObjectURL(file);
              link.href = url;
              link.download = `${layout.name}.json`;
              link.click();
              URL.revokeObjectURL(url);
            });
        })
        .addExtraButton((b) => {
          b.setIcon("trash")
            .setTooltip("Delete")
            .onClick(async () => {
              this.manager.layoutSettings.layouts =
                this.manager.layoutSettings.layouts.filter(
                  (l) => l.id !== layout.id
                );
              await this.plugin.saveSettings();
              this.manager.removeLayout(layout.id);

              this.generateLayouts(outerContainer);
            });
        });
    }
  }

}
class CreateStatblockModal extends FantasyStatblockModal {
  creator!: LayoutEditor;
  layout: Layout;
  saved: boolean = false;
  constructor(
    public plugin: StatBlockPlugin,
    layout: Layout = {
      name: "Layout",
      blocks: [],
      id: nanoid()
    }
  ) {
    super(plugin);
    this.layout = fastCopy(layout);
    this.modalEl.addClasses(["mod-sidebar-layout", "mod-settings"]);
    this.contentEl.addClass("vertical-tabs-container");
  }

  onOpen() {
    this.display();
  }

  display() {
    this.titleEl.createSpan({ text: "Create Layout" });
    this.creator = new LayoutEditor({
      target: this.contentEl,
      props: {
        layout: this.layout,
        plugin: this.plugin
      }
    });

    this.creator.$on("saved", () => {
      this.saved = true;
      this.close();
    });
    this.creator.$on("cancel", () => {
      this.close();
    });
  }
}
