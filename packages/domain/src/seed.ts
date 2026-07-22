export const launchChannels = ["General", "Family", "Health", "Prayer Requests", "Job Offers", "Looking for a Job", "Technology", "Child Rearing", "Travel", "Fun", "Food"] as const;

const firstNames = ["Mia", "Daniel", "Priya", "Aiden", "Elena", "Marcus", "Naomi", "Caleb", "Sophia", "Ethan", "Lydia", "Jonah", "Amara", "Lucas", "Grace", "Noah", "Hannah", "Isaac", "Leah", "Samuel", "Ruth", "Micah", "Clara", "Benjamin", "Esther", "Josiah"] as const;
const lastNames = ["Hart", "Cho", "Nair", "Brooks", "Vasquez", "Reed", "Okafor", "Bennett", "Kim", "Walker", "Morris", "Patel", "Lewis", "Foster", "Chen", "Bailey", "Wright", "Adams", "Turner", "Ross", "Nguyen", "King", "Scott", "Rivera", "Morgan", "Bell"] as const;

export const alumniSeeds = Array.from({ length: 26 }, (_, i) => {
  const year = 2001 + i;
  const first = firstNames[i]!;
  const last = lastNames[i]!;
  return { displayName: `${first} ${last}`, email: `${first}.${last}@example.test`.toLowerCase(), year, badge: i % 3 === 1 ? "two-year" as const : "four-year" as const };
});
export const spouseSeeds = ["Claire Hart", "Owen Cho", "Maya Brooks", "Theo Lewis"].map((displayName) => ({ displayName, email: `${displayName.replace(" ", ".").toLowerCase()}@example.test`, year: null, badge: "spouse" as const }));
export const classYears = Array.from({ length: 26 }, (_, i) => 2001 + i);
