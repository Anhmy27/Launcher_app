"use client";

import { useEffect, useState } from "react";
import { apiClient, User } from "@/lib/api";
import { useLocale } from "@/lib/locale-context";

export default function UsersPage() {
  const { t } = useLocale();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getUsers();
      setUsers(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedLoadUsers);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await apiClient.toggleUserActive(id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedUpdateUser);
    }
  };

  return (
    <div>
      <h1 className="admin-page-title">{t.usersTitle}</h1>
      <p className="admin-page-subtitle">{t.usersSubtitle}</p>

      {error && <div className="admin-alert-error">{error}</div>}

      <div className="admin-table-wrap">
        {isLoading ? (
          <div className="admin-empty">{t.loadingUsers}</div>
        ) : users.length === 0 ? (
          <div className="admin-empty">{t.noUsers}</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t.email}</th>
                <th>{t.fullName}</th>
                <th>{t.role}</th>
                <th>{t.status}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.full_name}</td>
                  <td>
                    <span className="admin-badge admin-badge-blue">
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${user.is_active ? "admin-badge-green" : "admin-badge-red"}`}
                    >
                      {user.is_active ? t.active : t.banned}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleToggleActive(user.id)}
                      className={user.is_active ? "admin-btn-danger" : "admin-btn-success"}
                    >
                      {user.is_active ? t.ban : t.unban}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
