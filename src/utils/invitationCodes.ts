export const parseInvitationCodes = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((code) => code.trim())
        .filter(Boolean)
    )
  );
