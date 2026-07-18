import { subscribeNewsletter } from "@lib/newsletter";
import { NextResponse } from "next/server";

interface ResponseData {
  message: string;
}



export async function POST(req: Request) {
    try {
        const { email } = await req.json().catch(() => ({}));
        await subscribeNewsletter(email);
    } catch (error) {
        return NextResponse.json<ResponseData>({ message: 'Error adding user to list' }, { status: 500 });
    }
    return NextResponse.json<ResponseData>({ message: 'User subscribed!' }, { status: 200 });
}
