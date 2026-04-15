export declare const TIER_LIMITS: {
    readonly guest: {
        readonly maxPublicGroups: 3;
        readonly maxGroupCreations: 0;
        readonly rateLimitMs: 10000;
        readonly canSendDMs: false;
        readonly canUploadImages: false;
        readonly canUploadFiles: false;
        readonly canUseGifs: false;
        readonly allowedReactions: readonly ["👍", "👎"];
        readonly hasHistory: false;
    };
    readonly registered: {
        readonly maxPublicGroups: 5;
        readonly maxGroupCreations: 3;
        readonly rateLimitMs: 1000;
        readonly canSendDMs: true;
        readonly canUploadImages: true;
        readonly canUploadFiles: false;
        readonly canUseGifs: true;
        readonly maxImageSize: number;
        readonly allowedReactions: "all";
        readonly hasHistory: true;
    };
    readonly premium: {
        readonly maxPublicGroups: number;
        readonly maxGroupCreations: number;
        readonly rateLimitMs: 500;
        readonly canSendDMs: true;
        readonly canUploadImages: true;
        readonly canUploadFiles: true;
        readonly canUseGifs: true;
        readonly maxImageSize: number;
        readonly maxFileSize: number;
        readonly allowedReactions: "all";
        readonly hasHistory: true;
        readonly canCustomizeColors: true;
        readonly canCustomizeSounds: true;
        readonly canSendEphemeral: true;
    };
};
export declare const VALIDATION: {
    username: {
        minLength: number;
        maxLength: number;
        pattern: RegExp;
    };
    password: {
        minLength: number;
        pattern: RegExp;
    };
    message: {
        maxLength: number;
    };
    bio: {
        maxLength: number;
    };
    groupName: {
        minLength: number;
        maxLength: number;
    };
    groupDescription: {
        maxLength: number;
    };
};
export declare const SALON_CLEANUP: {
    inactiveDelay: number;
    archiveDelay: number;
    deleteDelay: number;
    premiumMultiplier: number;
};
export declare const MODERATION: {
    autoHideThreshold: number;
    guestRateLimitMultiplier: number;
};
//# sourceMappingURL=constants.d.ts.map