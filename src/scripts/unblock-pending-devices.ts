import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

type Mode = "promote-primary" | "trust-secondary";

interface DeviceRecord {
  userId: string;
  deviceId: string;
  status: string;
  isPrimary?: boolean;
  registeredAt: string;
  lastSeenAt?: string;
  approvedAt?: string;
  approvedByDeviceId?: string;
  deviceLabel?: string;
  platform?: string;
  identityKey?: {
    keyId: string;
    algorithm: string;
    publicKey: string;
    signatureByPrimary?: string;
  };
}

const DEFAULT_REGION = process.env.AWS_REGION ?? "ap-southeast-1";
const DEFAULT_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "ap-southeast-1_4JjZBjBlY";
const DEFAULT_TABLE_NAME = process.env.DEVICES_TABLE_NAME ?? "nunti-devices-v2-production";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  node dist/src/scripts/unblock-pending-devices.js --email <email> [--count <n>] [--mode promote-primary|trust-secondary] [--dry-run]",
      "",
      "Options:",
      "  --email <email>           User email to target",
      "  --count <n>               Number of latest pending devices to unblock (default: 1)",
      "  --mode <mode>             Recovery mode (default: promote-primary)",
      "  --region <region>         AWS region (default: ap-southeast-1)",
      "  --user-pool-id <id>       Cognito user pool id",
      "  --table-name <name>       DynamoDB devices table name",
      "  --dry-run                 Print what would change without updating DynamoDB",
      "",
      "Notes:",
      "  promote-primary: marks pending devices as trusted primary devices.",
      "  trust-secondary: marks pending devices as trusted non-primary devices without a primary signature.",
      "  The promote-primary mode is operationally useful for account recovery, but it can leave multiple primary devices.",
    ].join("\n"),
  );
  process.exit(1);
}

function getArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function devicePk(userId: string): string {
  return `USER#${userId}`;
}

function deviceSk(deviceId: string): string {
  return `DEVICE#${deviceId}`;
}

async function lookupUserSub(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
): Promise<string> {
  const result = await client.send(new ListUsersCommand({
    UserPoolId: userPoolId,
    Filter: `email = "${email}"`,
    Limit: 1,
  }));

  const user = result.Users?.[0];
  const sub = user?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;

  if (!sub) {
    throw new Error(`User not found for email ${email}`);
  }

  return sub;
}

async function listDevices(
  ddbDocClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<DeviceRecord[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    ExpressionAttributeValues: {
      ":pk": devicePk(userId),
      ":sk": "DEVICE#",
    },
  }));

  return (result.Items ?? []) as DeviceRecord[];
}

function pickPendingDevices(devices: DeviceRecord[], count: number): DeviceRecord[] {
  return devices
    .filter((device) => device.status === "pending")
    .sort((left, right) => {
      return new Date(right.registeredAt).getTime() - new Date(left.registeredAt).getTime();
    })
    .slice(0, count);
}

async function unblockDevice(
  ddbDocClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  deviceId: string,
  mode: Mode,
): Promise<DeviceRecord> {
  const now = new Date().toISOString();
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: tableName,
    Key: {
      pk: devicePk(userId),
      sk: deviceSk(deviceId),
    },
    UpdateExpression: "SET #status = :trusted, isPrimary = :isPrimary, approvedAt = :approvedAt, lastSeenAt = :lastSeenAt REMOVE approvedByDeviceId",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":trusted": "trusted",
      ":isPrimary": mode === "promote-primary",
      ":approvedAt": now,
      ":lastSeenAt": now,
    },
    ReturnValues: "ALL_NEW",
  }));

  if (!result.Attributes) {
    throw new Error(`Device ${deviceId} not found after update`);
  }

  return result.Attributes as DeviceRecord;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = getArg(args, "--email");
  const countArg = getArg(args, "--count");
  const modeArg = getArg(args, "--mode");
  const region = getArg(args, "--region") ?? DEFAULT_REGION;
  const userPoolId = getArg(args, "--user-pool-id") ?? DEFAULT_USER_POOL_ID;
  const tableName = getArg(args, "--table-name") ?? DEFAULT_TABLE_NAME;
  const dryRun = hasFlag(args, "--dry-run");

  if (!email) {
    usage();
  }

  const count = countArg ? Number.parseInt(countArg, 10) : 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Invalid --count value: ${countArg}`);
  }

  const mode = (modeArg ?? "promote-primary") as Mode;
  if (mode !== "promote-primary" && mode !== "trust-secondary") {
    throw new Error(`Invalid --mode value: ${modeArg}`);
  }

  const cognitoClient = new CognitoIdentityProviderClient({ region });
  const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  console.log(`Resolving user for ${email} in ${userPoolId}`);
  const userId = await lookupUserSub(cognitoClient, userPoolId, email);

  console.log(`Listing devices from ${tableName} for user ${userId}`);
  const devices = await listDevices(ddbDocClient, tableName, userId);
  const pendingDevices = pickPendingDevices(devices, count);

  if (pendingDevices.length === 0) {
    console.log("No pending devices found.");
    return;
  }

  console.log(`Selected ${pendingDevices.length} pending device(s) using mode ${mode}:`);
  for (const device of pendingDevices) {
    console.log(
      JSON.stringify(
        {
          deviceId: device.deviceId,
          registeredAt: device.registeredAt,
          status: device.status,
          isPrimary: device.isPrimary ?? null,
          deviceLabel: device.deviceLabel ?? null,
          hasIdentityKey: !!device.identityKey?.publicKey,
        },
        null,
        2,
      ),
    );
  }

  if (dryRun) {
    console.log("Dry run only. No changes applied.");
    return;
  }

  for (const device of pendingDevices) {
    const updated = await unblockDevice(
      ddbDocClient,
      tableName,
      userId,
      device.deviceId,
      mode,
    );

    console.log(
      JSON.stringify(
        {
          updatedDeviceId: updated.deviceId,
          status: updated.status,
          isPrimary: updated.isPrimary ?? null,
          approvedAt: updated.approvedAt ?? null,
        },
        null,
        2,
      ),
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
