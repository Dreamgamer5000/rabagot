export function Footer() {
    return (
        <footer className="border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-14 items-center flex-col md:flex-row justify-between">
                <p className="text-sm text-muted-foreground">
                    © 2026 PicShare AI. All rights reserved.
                </p>
                <p className="md:pb-0 pb-2 text-sm text-muted-foreground">
                    Built with <span className="text-red-500 animate-pulse">❤️</span> for{" "}
                    <a
                        href="https://github.com/Dreamgamer5000/rabagot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                    >
                        Event Photographers
                    </a>
                </p>
            </div>
        </footer>
    );
}
