import { AppName } from "@/Core/BaseConfig";
import { Config } from "@/Core/Config";
import { KeyValue } from "@/Core/KeyValue";
import { LiveStreamDVR } from "@/Core/LiveStreamDVR";
import { LOGLEVEL, log } from "@/Core/Log";
import { TwitchGame } from "@/Core/Providers/Twitch/TwitchGame";
import type { ApiSettingsResponse } from "@common/Api/Api";
import type express from "express";
import { version } from "../../package.json";
import { TwitchHelper } from "../Providers/Twitch";

export async function GetSettings(
    req: express.Request,
    res: express.Response
): Promise<void> {
    const is_guest =
        Config.getInstance().cfg<boolean>("guest_mode", false) &&
        !req.session.authenticated;

    const config: Record<string, any> = {};
    for (const rawKey in Config.settingsFields) {
        const key = rawKey as keyof typeof Config.settingsFields;
        const field = Config.getSettingField(key);
        // if (field.secret) continue;
        if (is_guest && field !== undefined && !field.guest) continue;
        config[key] = Config.getInstance().cfg(key);
    }

    const websocketQuotas = TwitchHelper.eventWebsockets.map((ws) => {
        return {
            ...ws.quotas,
            subscriptions: ws.getSubscriptions().length,
            id: ws.id,
        };
    });

    res.send({
        data: {
            app_name: AppName,
            config: config,
            channels: LiveStreamDVR.getInstance().channels_config,
            favourite_games: TwitchGame.favourite_games,
            fields: Config.settingsFields,
            version: version,
            server: "ts-server",
            websocket_url: Config.getInstance().getWebsocketClientUrl(),
            errors: LiveStreamDVR.getErrors(),
            server_git_hash: Config.getInstance().gitHash,
            server_git_branch: Config.getInstance().gitBranch,
            guest: is_guest,
            quotas: {
                twitch: {
                    max_total_cost: KeyValue.getInstance().getInt(
                        "twitch.max_total_cost"
                    ),
                    total_cost:
                        KeyValue.getInstance().getInt("twitch.total_cost"),
                    total: KeyValue.getInstance().getInt("twitch.total"),
                },
            },
            websocket_quotas: websocketQuotas,
            // guest: is_guest,
        },
        status: "OK",
    } as ApiSettingsResponse);
}

export function SaveSettings(
    req: express.Request,
    res: express.Response
): void {
    const postConfig = req.body.config;

    if (!postConfig) {
        res.api(400, {
            status: "ERROR",
            message: "No config provided",
        });
        return;
    }

    let force_new_token = false;
    if (
        Config.getInstance().cfg("api_client_id") !== postConfig.api_client_id
    ) {
        force_new_token = true;
    }

    let fields = 0;
    for (const key in Config.settingsFields) {
        const setting = Config.getSettingField(
            key as keyof typeof Config.settingsFields
        );
        if (
            setting !== undefined &&
            setting.required &&
            postConfig[key] === undefined
        ) {
            res.api(400, {
                status: "ERROR",
                message: `Missing required setting: ${key}`,
            });
            return;
        }
        if (postConfig[key] !== undefined) {
            fields++;
        }
    }

    if (fields == 0) {
        res.api(400, {
            status: "ERROR",
            message: "No settings to save",
        });
        return;
    }

    // validate and save settings
    for (const rawKey in Config.settingsFields) {
        const key = rawKey as keyof typeof Config.settingsFields;
        const setting = Config.getSettingField(key);
        if (setting === undefined) {
            log(LOGLEVEL.ERROR, "Settings", `Setting not found: ${key}`);
            continue;
        }
        if (setting.type === "boolean") {
            Config.getInstance().setConfig<boolean>(key, postConfig[key]);
        } else if (setting.type === "number") {
            if (postConfig[key] !== undefined) {
                Config.getInstance().setConfig<number>(
                    key,
                    parseInt(postConfig[key])
                );
            }
        } else {
            if (postConfig[key] !== undefined) {
                Config.getInstance().setConfig(key, postConfig[key]);
            }
        }
    }

    Config.getInstance().saveConfig("settings form saved");

    if (force_new_token) {
        TwitchHelper.getAccessToken(true);
    }

    res.send({
        message: "Settings saved",
        status: "OK",
    });

    return;
}

export async function ValidateExternalURL(
    req: express.Request,
    res: express.Response
): Promise<void> {
    // const test_url = req.body.url;

    /*
    // verify app_url
    if (req.body.app_url !== undefined && req.body.app_url !== "debug") {

        const test_url = req.body.app_url;

        try {
            await Config.getInstance().validateExternalURL(test_url);
        } catch (error) {
            res.send({
                status: "ERROR",
                message: `External URL is invalid: ${(error as Error).message}`,
            });
            return;
        }

    }
    */

    try {
        await Config.getInstance().validateExternalURL();
    } catch (error) {
        res.send({
            status: "ERROR",
            message: `External URL is invalid: ${(error as Error).message}`,
        });
        return;
    }

    res.send({
        status: "OK",
        message: "External URL is valid",
    });

    return;
}

export function SetDebug(req: express.Request, res: express.Response): void {
    if (req.query.enable === undefined) {
        res.api(400, {
            status: "ERROR",
            message: "Missing enable parameter",
        });
        return;
    }

    // Config.getInstance().forceDebug = req.query.enable === "1";

    Config.debug = req.query.enable === "1";

    res.send({
        status: "OK",
        message: `Debug mode set to ${Config.debug}`,
    });
}
