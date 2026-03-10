import NextAuth, { type NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
            // Temporarily removed for testing - re-enable after OAuth consent screen is configured
            // authorization: {
            //     params: {
            //         hd: "monash.edu",
            //         prompt: "consent",
            //         access_type: "offline",
            //         response_type: "code"
            //     }
            // }
        }),
    ],
    callbacks: {
        async jwt({ token, user, account }) {
            if (account && user) {
                token.accessToken = account.access_token
                token.email = user.email
                token.name = user.name
            }
            return token
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.email = token.email as string
                session.user.name = token.name as string
            }
            return session
        },
        // Temporarily allow all emails for testing
        // async signIn({ user }) {
        //     // Only allow monash.edu emails
        //     if (user.email && user.email.endsWith('@monash.edu')) {
        //         return true
        //     }
        //     return false
        // }
    },
    pages: {
        signIn: '/',  // Redirect to home page for sign-in
    },
    session: {
        strategy: "jwt",
    },
}

export default NextAuth(authOptions)
