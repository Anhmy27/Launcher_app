"use client";

import { useAuth } from "@/lib/auth-context";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-600 text-sm font-medium">User Role</h3>
          <p className="text-2xl font-bold text-blue-600 mt-2">
            {user?.role.toUpperCase()}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-600 text-sm font-medium">Email</h3>
          <p className="text-lg font-semibold mt-2">{user?.email}</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-600 text-sm font-medium">Full Name</h3>
          <p className="text-lg font-semibold mt-2">{user?.full_name}</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-600 text-sm font-medium">Status</h3>
          <p
            className={`text-lg font-semibold mt-2 ${user?.is_active ? "text-green-600" : "text-red-600"}`}
          >
            {user?.is_active ? "Active" : "Inactive"}
          </p>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">API Status</h2>
        <div className="bg-green-50 border border-green-200 p-4 rounded">
          <p className="text-green-800">✅ Backend API is connected!</p>
          <p className="text-gray-600 text-sm mt-2">
            Base URL: http://localhost:8080/api
          </p>
        </div>
      </div>
    </div>
  );
}
