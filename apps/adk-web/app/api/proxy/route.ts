import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const apiUrl = searchParams.get("apiUrl");
		const path = searchParams.get("path") || "";

		if (!apiUrl) {
			return NextResponse.json(
				{ error: "API URL is required" },
				{ status: 400 },
			);
		}

		const response = await fetch(`${apiUrl}${path}`, {
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return NextResponse.json(data);
	} catch (error) {
		console.error("Proxy error:", error);
		return NextResponse.json(
			{ error: "Failed to proxy request" },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { apiUrl, path, data } = body;

		if (!apiUrl) {
			return NextResponse.json(
				{ error: "API URL is required" },
				{ status: 400 },
			);
		}

		const fullUrl = `${apiUrl}${path}`;

		const response = await fetch(fullUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("API server error:", errorText);
			console.error("Full URL that failed:", fullUrl);
			console.error("Request body:", JSON.stringify(data));
			throw new Error(
				`HTTP error! status: ${response.status}, body: ${errorText}`,
			);
		}

		const responseData = await response.json();
		return NextResponse.json(responseData);
	} catch (error) {
		console.error("Proxy error:", error);
		return NextResponse.json(
			{
				error: "Failed to proxy request",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
