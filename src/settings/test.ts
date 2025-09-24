import { PluginSettingTab, Setting } from "obsidian";
import type { DefaultLayout, Layout } from "src/layouts/layout.types";
import type LayoutManager from "src/layouts/manager";
import type StatBlockPlugin from "src/main";

export default class StatblockSettingTab extends PluginSettingTab {
  plugin: StatBlockPlugin

  generateLayouts(
    containerEl: HTMLDivElement,
    alwaysImport
  ) {
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
                  !alwaysImport &&
                  layout.blocks.find(
                    (b) => b.type == "javascript"
                  ) &&
                  !(await confirm(this.plugin))
                ) {
                  resolve();
                }
                layouts.push(
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
              layouts.push(l);
              this.plugin.manager.addLayout(l);
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
        for (const layout of this.plugin.manager.getAllLayouts()) {
          d.addOption(layout.id, layout.name);
        }

        if (
          !default ||
          !this.plugin.manager
            .getAllLayouts()
            .find(({ id }) => id == default)
        ) {
          default = Layout5e.id;
          await this.plugin.saveSettings();
        }

        d.setValue(default ?? Layout5e.id);

        d.onChange(async (v) => {
          default = v;
          this.plugin.manager.setDefaultLayout(v);
          await this.plugin.saveSettings();
        });
      });
    new Setting(statblockAdditional)
      .setName("Show Advanced Options")
      .setDesc("Show advanced options when editing layout blocks.")
      .addToggle((t) =>
        t
          .setValue(showAdvanced)
          .onChange(async (v) => {
            showAdvanced = v;
            await this.plugin.saveSettings();
          })
      );

    const layoutContainer =
      statblockCreatorContainer.createDiv("additional");

    this.buildCustomLayouts(layoutContainer, containerEl, this.plugin.manager, layouts, defaultLayouts, DefaultLayouts);
  }
}