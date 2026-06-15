const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN ?? process.env.CLERK_FRONTEND_API_URL;

export default {
  providers: clerkDomain
    ? [
        {
          domain: clerkDomain,
          applicationID: "convex",
        },
      ]
    : [],
};
