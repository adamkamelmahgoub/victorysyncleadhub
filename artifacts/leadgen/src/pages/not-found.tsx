import { PageTitle } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-stack min-h-[60dvh] w-full flex items-center justify-center">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 flex-wrap gap-4 min-w-0">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <PageTitle>404 Page Not Found</PageTitle>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            This page is unavailable. Use the workspace navigation to continue.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
