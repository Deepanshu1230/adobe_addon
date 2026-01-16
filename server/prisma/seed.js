// Seed script to populate demo compliance rules
// Run with: npm run db:seed

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEMO_RULES = [
  {
    pattern: "100% waterproof",
    reason: "Product is only water-resistant (IP67), not fully waterproof. This claim could result in legal liability.",
    suggestion: "water-resistant (IP67 rated)",
    category: "legal",
    severity: "high",
  },
  {
    pattern: "waterproof",
    reason: "Avoid unqualified 'waterproof' claims; always specify the rating to prevent misleading customers.",
    suggestion: "water-resistant",
    category: "legal",
    severity: "medium",
  },
  {
    pattern: "guaranteed",
    reason: "'Guaranteed' implies a legal warranty. Verify with Legal team before using.",
    suggestion: "designed to",
    category: "legal",
    severity: "medium",
  },
  {
    pattern: "best in class",
    reason: "Superlative claims require substantiation with data. Could be challenged by competitors.",
    suggestion: "industry-leading",
    category: "brand",
    severity: "low",
  },
  {
    pattern: "never fails",
    reason: "Absolute reliability claims are legally risky and impossible to guarantee.",
    suggestion: "highly reliable",
    category: "legal",
    severity: "high",
  },
  {
    pattern: "cures",
    reason: "Medical cure claims require FDA approval. Unapproved claims can result in regulatory action.",
    suggestion: "may help with",
    category: "legal",
    severity: "high",
  },
  {
    pattern: "safe for all ages",
    reason: "Age safety claims need product-specific verification and testing documentation.",
    suggestion: "suitable for most users",
    category: "safety",
    severity: "medium",
  },
  {
    pattern: "unlimited",
    reason: "'Unlimited' often has hidden restrictions. Be specific about actual limits.",
    suggestion: "extensive",
    category: "legal",
    severity: "medium",
  },
  {
    pattern: "free",
    reason: "'Free' offers must comply with FTC guidelines. Ensure no hidden costs.",
    suggestion: "included at no extra cost",
    category: "legal",
    severity: "medium",
  },
  {
    pattern: "scientifically proven",
    reason: "Requires peer-reviewed studies to substantiate. Could be challenged.",
    suggestion: "backed by research",
    category: "legal",
    severity: "high",
  },
];

async function main() {
  console.log("🌱 Seeding database with demo compliance rules...\n");

  // Clear existing rules
  await prisma.policyRule.deleteMany({});

  // Insert demo rules
  for (const rule of DEMO_RULES) {
    const created = await prisma.policyRule.create({
      data: rule,
    });
    console.log(`  ✅ Added rule: "${rule.pattern}" (${rule.severity})`);
  }

  console.log(`\n🎉 Seeded ${DEMO_RULES.length} compliance rules!`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
