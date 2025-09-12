"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface ConnectionStatusProps {
	apiUrl: string;
}

export function ConnectionStatus({ apiUrl }: ConnectionStatusProps) {
	const router = useRouter();
	const [dialogOpen, setDialogOpen] = useState(false);
	const form = useForm<{ apiUrl: string }>({
		defaultValues: { apiUrl },
		mode: "onSubmit",
	});

	const DEFAULT_API_URL = "http://localhost:8042";

	const currentHost = useMemo(() => {
		try {
			return new URL(apiUrl).host;
		} catch {
			return apiUrl;
		}
	}, [apiUrl]);

	const buildUrlWithParam = useCallback((nextApiUrl: string | null) => {
		const url = new URL(window.location.href);
		// Clear conflicting params first
		url.searchParams.delete("port");
		if (nextApiUrl && nextApiUrl.length > 0) {
			url.searchParams.set("apiUrl", nextApiUrl);
		} else {
			url.searchParams.delete("apiUrl");
		}
		return url.toString();
	}, []);

	const normalizeUrl = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return "";
		// Add http:// if user types host:port
		if (!/^https?:\/\//i.test(trimmed)) {
			return `http://${trimmed}`;
		}
		return trimmed;
	};

	const handleOpen = () => {
		form.reset({ apiUrl });
		setDialogOpen(true);
	};

	const onSubmit = (values: { apiUrl: string }) => {
		const value = normalizeUrl(values.apiUrl);
		try {
			const url = new URL(value);
			router.replace(buildUrlWithParam(url.toString()));
			setDialogOpen(false);
		} catch {
			form.setError("apiUrl", {
				type: "validate",
				message: "Please enter a valid URL (e.g. http://localhost:8042)",
			});
		}
	};

	const handleReset = () => {
		form.reset({ apiUrl: DEFAULT_API_URL });
		// Remove apiUrl and port from query to use default
		router.replace(buildUrlWithParam(null));
		setDialogOpen(false);
	};

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleOpen}
						className="flex items-center space-x-2 cursor-pointer"
					>
						<div className="h-2 w-2 rounded-full bg-green-500" />
						<span className="text-xs text-muted-foreground">{currentHost}</span>
					</button>
				</TooltipTrigger>
				<TooltipContent>
					<span>Click to change connection URL</span>
				</TooltipContent>
			</Tooltip>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-[520px]">
					<DialogHeader>
						<DialogTitle>Change connection URL</DialogTitle>
					</DialogHeader>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="apiUrl"
								render={({ field }: any) => (
									<FormItem>
										<FormControl>
											<Input
												placeholder="http://localhost:8042"
												autoFocus
												value={field.value ?? ""}
												onChange={(e) => field.onChange(e.target.value)}
												onBlur={field.onBlur}
												name={field.name}
												ref={field.ref}
											/>
										</FormControl>
										<FormDescription>
											URL of the running ADK server this Web UI connects to.
											Usually http://localhost:8042 when launched via the ADK
											CLI.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<DialogFooter className="gap-2 sm:gap-0">
								<Button type="button" variant="secondary" onClick={handleReset}>
									<RefreshCcw />
									Reset to default
								</Button>
								<div className="flex gap-2 ml-auto">
									<Button
										type="button"
										variant="outline"
										onClick={() => setDialogOpen(false)}
									>
										Cancel
									</Button>
									<Button type="submit">Save</Button>
								</div>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</>
	);
}
