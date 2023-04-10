import { ActionMacroHelpers, SkillActionOptions } from "../index.ts";
import { CheckResultCallback } from "@system/action-macros/types.ts";
import { CreaturePF2e } from "@actor";
import { RawModifier, ModifierPF2e } from "@actor/modifiers.ts";

interface ChatMessageCheckFlags {
    context: {
        options: string[];
    };
    modifiers: RawModifier[];
}

export function createForgery(options: SkillActionOptions): Promise<void> {
    const modifiers = [
        new ModifierPF2e({
            label: "PF2E.Actions.CreateForgery.UnspecificHandwriting",
            modifier: 4,
            predicate: ["action:create-forgery:unspecific-handwriting"],
            type: "circumstance",
        }),
    ].concat(options?.modifiers ?? []);
    const slug = options?.skill ?? "society";
    const rollOptions = ["action:create-forgery"];

    return ActionMacroHelpers.simpleRollActionCheck({
        actors: options.actors,
        actionGlyph: options.glyph,
        title: "PF2E.Actions.CreateForgery.Title",
        checkContext: (opts) => ActionMacroHelpers.defaultCheckContext(opts, { modifiers, rollOptions, slug }),
        traits: ["downtime", "secret"],
        event: options.event,
        callback: async (result: CheckResultCallback) => {
            // consider any modifiers enabled in the roll dialog
            const societyDC = (() => {
                if (result.actor instanceof CreaturePF2e) {
                    const systemFlags = result.message?.flags.pf2e as unknown as ChatMessageCheckFlags;
                    const modifiers = (systemFlags.modifiers as RawModifier[])
                        .filter((modifier) => modifier.enabled)
                        .map((modifier) => {
                            return { ...modifier, predicate: [] };
                        })
                        .map((modifier) => new ModifierPF2e(modifier));
                    return result.actor.skills.society
                        .extend({
                            slug: result.actor.skills.society.slug,
                            modifiers,
                        })
                        .withRollOptions({
                            extraRollOptions: systemFlags.context.options,
                            origin: result.actor,
                        }).dc;
                }
                return null;
            })();
            const gmNotes = (() => {
                if (["criticalSuccess", "success"].includes(result.outcome ?? "")) {
                    return game.i18n.format("PF2E.Actions.CreateForgery.ForgedDocument.SuccessGmNote", {
                        societyDC: societyDC?.value ?? null,
                    });
                } else if (["criticalFailure", "failure"].includes(result.outcome ?? "")) {
                    return game.i18n.format("PF2E.Actions.CreateForgery.ForgedDocument.FailureGmNote", {
                        failure: game.i18n.localize("PF2E.Actions.CreateForgery.Notes.failure"),
                        success: game.i18n.localize("PF2E.Actions.CreateForgery.Notes.success"),
                        total: result.roll.total,
                    });
                }
                return "";
            })();

            // create forged document item
            await Item.create(
                {
                    img: "systems/pf2e/icons/equipment/adventuring-gear/scroll-case.webp",
                    name: game.i18n.localize("PF2E.Actions.CreateForgery.ForgedDocument.Name"),
                    type: "equipment",
                    system: {
                        description: {
                            gm: gmNotes,
                            value: game.i18n.format("PF2E.Actions.CreateForgery.ForgedDocument.Description", {
                                societyDC: societyDC?.value ?? null,
                            }),
                        },
                    },
                },
                {
                    parent: result.actor,
                }
            );

            // remind user that an item was created in the actor's inventory
            const notification = game.i18n.format("PF2E.Actions.CreateForgery.ForgedDocumentCreatedNotification", {
                name: result.actor.name,
            });
            ui.notifications.info(notification);

            options?.callback?.(result);
        },
        difficultyClass: options.difficultyClass ?? { value: 20 },
        extraNotes: (selector: string) => [
            ActionMacroHelpers.note(selector, "PF2E.Actions.CreateForgery", "criticalSuccess"),
            ActionMacroHelpers.note(selector, "PF2E.Actions.CreateForgery", "success"),
            ActionMacroHelpers.note(selector, "PF2E.Actions.CreateForgery", "failure"),
            ActionMacroHelpers.note(selector, "PF2E.Actions.CreateForgery", "criticalFailure"),
        ],
    }).catch((error: Error) => {
        ui.notifications.error(error.message);
        throw error;
    });
}
