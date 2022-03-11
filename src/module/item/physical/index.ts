import { ItemPF2e, ContainerPF2e } from "@item";
import { PhysicalItemData, TraitChatData } from "@item/data";
import { LocalizePF2e } from "@module/system/localize";
import { Rarity, Size } from "@module/data";
import { LootPF2e } from "@actor";
import { MystifiedTraits } from "@item/data/values";
import { getUnidentifiedPlaceholderImage } from "../identification";
import { IdentificationStatus, ItemCarryType, MystifiedData, PhysicalItemTrait } from "./data";
import { coinsToString, extractPriceFromItem } from "@item/treasure/helpers";
import { UserPF2e } from "@module/user";
import { getUsageDetails, isEquipped } from "./usage";

export abstract class PhysicalItemPF2e extends ItemPF2e {
    // The cached container of this item, if in a container, or null
    private _container: Embedded<ContainerPF2e> | null = null;

    get level(): number {
        return this.data.data.level.value;
    }

    get rarity(): Rarity {
        return this.data.data.traits.rarity;
    }

    get traits(): Set<PhysicalItemTrait> {
        return new Set(this.data.data.traits.value);
    }

    get quantity(): number {
        return Number(this.data.data.quantity ?? 1);
    }

    get size(): Size {
        return this.data.data.size;
    }

    get isEquipped(): boolean {
        return this.data.isEquipped;
    }

    get carryType(): ItemCarryType {
        return this.data.data.equipped.carryType ?? (this.data.data.containerId ? "worn" : "stowed");
    }

    get handsHeld(): number {
        return this.data.data.equipped.carryType === "held" ? this.data.data.equipped.handsHeld ?? 1 : 0;
    }

    get isHeld(): boolean {
        return this.handsHeld > 0;
    }

    get price(): string {
        return this.data.data.price.value;
    }

    get identificationStatus(): IdentificationStatus {
        return this.data.data.identification.status;
    }

    get isIdentified(): boolean {
        return this.data.isIdentified;
    }

    get isAlchemical(): boolean {
        return this.data.isAlchemical;
    }

    get isMagical(): boolean {
        const traits: Set<string> = this.traits;
        const magicTraits = ["magical", "arcane", "primal", "divine", "occult"] as const;
        return magicTraits.some((trait) => traits.has(trait));
    }

    get isInvested(): boolean | null {
        const traits: Set<string> = this.traits;
        if (!traits.has("invested")) return null;
        return this.data.isEquipped && this.data.isIdentified && this.data.data.equipped.invested === true;
    }

    get isCursed(): boolean {
        return this.data.isCursed;
    }

    get isTemporary(): boolean {
        return this.data.data.temporary === true;
    }

    get material() {
        const systemData = this.data.data;
        return systemData.preciousMaterial.value && systemData.preciousMaterialGrade.value
            ? {
                  type: systemData.preciousMaterial.value,
                  grade: systemData.preciousMaterialGrade.value,
              }
            : null;
    }

    get isInContainer(): boolean {
        return !!this.container;
    }

    get isStowed(): boolean {
        return !!this.container?.data.data.stowing;
    }

    /** Get this item's container, returning null if it is not in a container */
    get container(): Embedded<ContainerPF2e> | null {
        if (this.data.data.containerId === null) return (this._container = null);

        const container = this._container ?? this.actor?.items.get(this.data.data.containerId ?? "");
        if (container?.type === "backpack") this._container = container as Embedded<ContainerPF2e>;

        return this._container;
    }

    get activations() {
        return Object.values(this.data.data.activations ?? {}).map((action) => {
            const components: string[] = [];
            if (action.components.cast) components.push(game.i18n.localize("PF2E.Item.Activation.Cast"));
            if (action.components.command) components.push(game.i18n.localize("PF2E.Item.Activation.Command"));
            if (action.components.envision) components.push(game.i18n.localize("PF2E.Item.Activation.Envision"));
            if (action.components.interact) components.push(game.i18n.localize("PF2E.Item.Activation.Interact"));

            return {
                componentsLabel: components.join(", "),
                ...action,
            };
        });
    }

    /** Generate a list of strings for use in predication */
    override getRollOptions(prefix = this.type): string[] {
        const baseOptions = super.getRollOptions(prefix);
        const physicalItemOptions = Object.entries({
            equipped: this.isEquipped,
            magical: this.isMagical,
            uninvested: this.isInvested === false,
            [`material:${this.material?.type}`]: !!this.material,
        })
            .filter(([_key, isTrue]) => isTrue)
            .map(([key]) => key)
            .map((string) => {
                const delimitedPrefix = prefix ? `${prefix}:` : "";
                return `${delimitedPrefix}${string}`;
            });

        return [baseOptions, physicalItemOptions].flat();
    }

    override prepareBaseData(): void {
        super.prepareBaseData();

        const systemData = this.data.data;
        // null out empty-string values
        systemData.preciousMaterial.value ||= null;
        systemData.preciousMaterialGrade.value ||= null;
        systemData.containerId ||= null;
        systemData.stackGroup ||= null;

        // Normalize price string
        systemData.price.value = coinsToString(extractPriceFromItem(this.data, 1));

        this.data.isIdentified = systemData.identification.status === "identified";

        const traits = this.traits;
        this.data.isAlchemical = traits.has("alchemical");
        this.data.isCursed = traits.has("cursed");

        this.data.usage = getUsageDetails(systemData.usage.value);
        this.data.isEquipped = isEquipped(this.data.usage, this.data.data.equipped);
        if (!systemData.equipped.carryType) {
            systemData.equipped.carryType = systemData.containerId ? "stowed" : "worn";
        }

        // Magic and invested status is determined at the class-instance level since it can be updated later in data
        // preparation
        this.data.isMagical = this.isMagical;
        this.data.isInvested = this.isInvested;
        this.data.isTemporary = this.isTemporary;

        if (this.isTemporary) {
            systemData.price.value = "0 gp";
        }

        // Set the _container cache property to null if it no longer matches this item's container ID
        if (this._container?.id !== this.data.data.containerId) {
            this._container = null;
        }

        // Unequip items on loot actors so that rule elements are not initialized
        if (this.actor instanceof LootPF2e) {
            this.data.data.equipped.carryType = "worn";
            this.data.data.equipped.inSlot = false;
        }
    }

    /** Refresh certain derived properties in case of special data preparation from subclasses */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        this.data.isMagical = this.isMagical;
        this.data.isInvested = this.isInvested;

        const systemData = this.data.data;
        systemData.identification.identified = {
            name: this.name,
            img: this.img,
            data: {
                description: { value: this.description },
            },
        };

        // Update properties according to identification status
        const mystifiedData = this.getMystifiedData(this.identificationStatus);
        mergeObject(this.data, mystifiedData, { insertKeys: false, insertValues: false });

        // Fill gaps in unidentified data with defaults
        systemData.identification.unidentified = this.getMystifiedData("unidentified");
    }

    /** Can the provided item stack with this item? */
    isStackableWith(item: PhysicalItemPF2e): boolean {
        if (this.type !== item.type || this.name !== item.name || this.isIdentified !== item.isIdentified) return false;
        const thisData = this.toObject().data;
        const otherData = item.toObject().data;
        thisData.quantity = otherData.quantity;
        thisData.equipped = otherData.equipped;
        thisData.containerId = otherData.containerId;
        thisData.schema = otherData.schema;
        thisData.identification = otherData.identification;

        return JSON.stringify(thisData) === JSON.stringify(otherData);
    }

    /* Retrieve subtitution data for an unidentified or misidentified item, generating defaults as necessary */
    getMystifiedData(status: IdentificationStatus, _options?: Record<string, boolean>): MystifiedData {
        const mystifiedData: MystifiedData = this.data.data.identification[status];

        const name = mystifiedData.name || this.generateUnidentifiedName();
        const img = mystifiedData.img || getUnidentifiedPlaceholderImage(this.data);

        const description =
            mystifiedData.data.description.value ||
            (() => {
                if (status === "identified") return this.description;

                const formatString = LocalizePF2e.translations.PF2E.identification.UnidentifiedDescription;
                const itemType = this.generateUnidentifiedName({ typeOnly: true });
                const caseCorrect = (noun: string) =>
                    game.i18n.lang.toLowerCase() === "de" ? noun : noun.toLowerCase();
                return game.i18n.format(formatString, { item: caseCorrect(itemType) });
            })();

        return {
            name,
            img,
            data: {
                description: {
                    value: description,
                },
            },
        };
    }

    override getChatData(): Record<string, unknown> {
        const material = this.material
            ? game.i18n.format("PF2E.Item.Weapon.MaterialAndRunes.MaterialOption", {
                  type: game.i18n.localize(CONFIG.PF2E.preciousMaterials[this.material.type]),
                  grade: game.i18n.localize(CONFIG.PF2E.preciousMaterialGrades[this.material.grade]),
              })
            : null;

        return {
            rarity: {
                name: this.rarity,
                label: CONFIG.PF2E.rarityTraits[this.rarity],
                description: CONFIG.PF2E.traitsDescriptions[this.rarity],
            },
            description: { value: this.description },
            material,
        };
    }

    async setIdentificationStatus(status: IdentificationStatus): Promise<void> {
        if (this.identificationStatus === status) return;

        await this.update({
            "data.identification.status": status,
            "data.identification.unidentified": this.getMystifiedData("unidentified"),
        });
    }

    generateUnidentifiedName({ typeOnly = false }: { typeOnly?: boolean } = { typeOnly: false }): string {
        const itemType = game.i18n.localize(`ITEM.Type${this.data.type.capitalize()}`);
        if (typeOnly) return itemType;

        const formatString = LocalizePF2e.translations.PF2E.identification.UnidentifiedItem;
        return game.i18n.format(formatString, { item: itemType });
    }

    /** Include mystification-related rendering instructions for views that will display this data. */
    protected override traitChatData(dictionary: Record<string, string>): TraitChatData[] {
        const traitData = super.traitChatData(dictionary);
        for (const trait of traitData) {
            trait.mystified = !this.isIdentified && MystifiedTraits.has(trait.value);
            trait.excluded = trait.mystified && !game.user.isGM;
            if (trait.excluded) {
                delete trait.description;
            } else if (trait.mystified) {
                const gmNote = LocalizePF2e.translations.PF2E.identification.TraitGMNote;
                trait.description = trait.description
                    ? `${gmNote}\n\n${game.i18n.localize(trait.description)}`
                    : gmNote;
            }
        }

        return traitData;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** Set to unequipped upon acquiring */
    protected override async _preCreate(
        data: PreDocumentId<this["data"]["_source"]>,
        options: DocumentModificationContext<this>,
        user: UserPF2e
    ): Promise<void> {
        await super._preCreate(data, options, user);

        // Set some defaults
        this.data.update({
            "data.equipped.carryType": "worn",
            "data.equipped.-=handsHeld": null,
            "data.equipped.-=inSlot": null,
        });

        if (this.actor) {
            const isSlottedItem = this.data.usage.type === "worn" && !!this.data.usage.where;
            if (this.actor.isOfType("character", "npc") && isSlottedItem) {
                this.data.update({ "data.equipped.inSlot": false });
            }
        }
    }

    /** Clamp hit points to between zero and max */
    protected override async _preUpdate(
        changed: DeepPartial<this["data"]["_source"]>,
        options: DocumentModificationContext<this>,
        user: UserPF2e
    ): Promise<void> {
        if (typeof changed.data?.hp?.value === "number") {
            changed.data.hp.value = Math.clamped(changed.data.hp.value, 0, this.data.data.hp.max);
        }

        if (!changed.data) return await super._preUpdate(changed, options, user);

        // Remove equipped.handsHeld and equipped.inSlot if the item is held or worn anywhere
        const equipped: Record<string, unknown> = mergeObject(changed, { data: { equipped: {} } }).data.equipped;
        const newCarryType = String(equipped.carryType ?? this.data.data.equipped.carryType);
        if (!newCarryType.startsWith("held")) equipped.handsHeld = 0;

        const newUsage = getUsageDetails(String(changed.data.usage?.value ?? this.data.data.usage.value));
        const hasSlot = newUsage.type === "worn" && newUsage.where;
        const isSlotted = Boolean(equipped.inSlot ?? this.data.data.equipped.inSlot);

        if (hasSlot) {
            equipped.inSlot = isSlotted;
        } else {
            equipped["-=inSlot"] = null;
        }

        await super._preUpdate(changed, options, user);
    }
}

export interface PhysicalItemPF2e {
    readonly data: PhysicalItemData;
}
