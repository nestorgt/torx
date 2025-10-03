# Project Rules and Guidelines

This document outlines the rules, guidelines, and best practices for the Proxy Banks project. Follow these rules to maintain code quality, system reliability, and project consistency.

## 🚫 Critical Rules (NEVER BREAK)

### 1. Token Security
- **NEVER delete `tokens.json`** - Contains all API credentials and access tokens
- **NEVER commit `tokens.json`** to version control
- **NEVER hardcode API credentials** in source code
- **NEVER share credentials** in chat or documentation

### 2. Server Reliability
- **NEVER disable monitoring** - System depends on automated health checks
- **NEVER modify cron jobs** without understanding the impact
- **NEVER delete log files** without proper backup
- **NEVER change server paths** without updating all references

### 3. Code Integrity
- **NEVER break existing functionality** when adding new features
- **NEVER remove error handling** without replacing it
- **NEVER modify API endpoints** without updating all callers
- **NEVER change data structures** without updating all consumers

## 📋 Development Guidelines

### Code Style and Structure
- **Follow existing patterns** - Maintain consistency with current codebase
- **Use descriptive function names** - Functions should clearly indicate their purpose
- **Add minimal comments** - Code should be self-documenting
- **Keep functions focused** - Single responsibility principle
- **Use helper functions** - Avoid code duplication

### Google Apps Script (GAS) Rules
- **Use underscore suffix** for private functions (e.g., `helperFunction_()`)
- **Maintain error handling** in all API calls
- **Use try-catch blocks** for critical operations
- **Log errors appropriately** for debugging
- **Test functions individually** before integration

### Node.js Server Rules
- **Use async/await** for all asynchronous operations
- **Handle all promise rejections** with proper error handling
- **Log all API calls** with appropriate detail levels
- **Use environment variables** for configuration
- **Implement proper HTTP status codes**

## 🔧 Modification Guidelines

### When Adding New Banks
1. **Add to `CELLS` mapping** in `gs_banks.gs`
2. **Create fetch function** following naming convention
3. **Add to `updateAllBalances()`** function
4. **Update monthly expenses** calculations if needed
5. **Test thoroughly** before deployment

### When Modifying Existing Code
1. **Read the entire function** before making changes
2. **Understand dependencies** and side effects
3. **Test changes** in isolation first
4. **Update documentation** if needed
5. **Verify no regressions** in other functions

### When Refactoring
1. **Identify all usages** of code to be refactored
2. **Create helper functions** for common patterns
3. **Update all callers** to use new structure
4. **Test thoroughly** after refactoring
5. **Remove old code** only after verification

## 🚨 Error Handling Rules

### API Failures
- **Always provide fallback** for API failures
- **Log detailed error information** for debugging
- **Return meaningful error messages** to users
- **Implement retry logic** for transient failures
- **Cache data appropriately** to handle outages

### Server Failures
- **Monitor server health** continuously
- **Restart automatically** on critical failures
- **Log all restart events** with timestamps
- **Alert on repeated failures** within short timeframes
- **Maintain service availability** above 99%

### Data Validation
- **Validate all incoming data** from APIs
- **Handle missing or malformed data** gracefully
- **Provide default values** when data is unavailable
- **Log data quality issues** for monitoring
- **Ensure data consistency** across all sources

## 📊 Monitoring and Logging Rules

### Logging Standards
- **Use consistent log formats** across all components
- **Include timestamps** in all log entries
- **Log at appropriate levels** (debug, info, warn, error)
- **Include context information** for debugging
- **Rotate log files** to prevent disk space issues

### Monitoring Requirements
- **Check server health** every 2 minutes minimum
- **Verify API connectivity** regularly
- **Monitor memory usage** and system resources
- **Alert on critical failures** immediately
- **Maintain historical data** for trend analysis

### Health Check Rules
- **Test all critical endpoints** in health checks
- **Verify database connectivity** if applicable
- **Check external API availability** where possible
- **Validate data freshness** and accuracy
- **Report system status** clearly and concisely

## 🔄 Deployment and Maintenance Rules

### Before Making Changes
1. **Backup current working state**
2. **Test changes in isolation**
3. **Verify all dependencies**
4. **Check for breaking changes**
5. **Plan rollback strategy**

### During Deployment
1. **Deploy during low-traffic periods**
2. **Monitor system closely** after changes
3. **Verify all functions work** as expected
4. **Check error rates** and performance
5. **Be ready to rollback** if issues arise

### After Deployment
1. **Monitor for 24 hours** minimum
2. **Check all log files** for errors
3. **Verify data accuracy** and completeness
4. **Test all user-facing features**
5. **Document any issues** and resolutions

## 🛡️ Security Rules

### API Security
- **Rotate credentials regularly** (every 90 days)
- **Use least privilege** for API access
- **Monitor API usage** for anomalies
- **Implement rate limiting** where possible
- **Log all API access** for auditing

### Data Security
- **Encrypt sensitive data** at rest
- **Use HTTPS** for all communications
- **Validate all inputs** to prevent injection
- **Implement proper access controls**
- **Regular security audits** of code and infrastructure

### Network Security
- **Use VPN** for remote access when possible
- **Implement firewall rules** appropriately
- **Monitor network traffic** for suspicious activity
- **Keep systems updated** with security patches
- **Regular penetration testing** of critical components

## 📈 Performance Rules

### Optimization Guidelines
- **Minimize API calls** through caching
- **Use efficient data structures** and algorithms
- **Implement proper error handling** without performance impact
- **Monitor resource usage** continuously
- **Optimize database queries** if applicable

### Resource Management
- **Monitor memory usage** and prevent leaks
- **Manage CPU usage** during peak times
- **Optimize network bandwidth** usage
- **Implement proper cleanup** procedures
- **Scale resources** as needed

## 🧪 Testing Rules

### Before Deployment
- **Test all new functionality** thoroughly
- **Verify error handling** works correctly
- **Test with various data scenarios** (empty, malformed, large)
- **Verify performance** under load
- **Test rollback procedures** if needed

### Continuous Testing
- **Monitor system health** continuously
- **Test critical paths** regularly
- **Verify data accuracy** periodically
- **Test disaster recovery** procedures
- **Validate security measures** regularly

## 📝 Documentation Rules

### Code Documentation
- **Document all public functions** with clear descriptions
- **Include parameter descriptions** and return values
- **Document error conditions** and handling
- **Keep documentation current** with code changes
- **Use consistent formatting** throughout

### System Documentation
- **Update README.md** with significant changes
- **Document all configuration** changes
- **Record troubleshooting procedures** for common issues
- **Maintain architecture diagrams** when applicable
- **Keep deployment procedures** current

## 🚀 Best Practices

### Development
- **Make small, incremental changes** rather than large modifications
- **Test changes frequently** during development
- **Use version control** effectively with meaningful commit messages
- **Review code** before deployment
- **Follow the principle of least surprise**

### Operations
- **Monitor systems proactively** rather than reactively
- **Implement proper alerting** for critical issues
- **Maintain disaster recovery** procedures
- **Keep systems updated** with security patches
- **Document all operational procedures**

### Maintenance
- **Regular health checks** of all components
- **Proactive monitoring** of system resources
- **Regular backup** of critical data
- **Periodic security audits** and updates
- **Continuous improvement** of processes and procedures

## ⚠️ Warning Signs to Watch For

### Code Issues
- **Repeated code patterns** that could be refactored
- **Complex functions** that are hard to understand
- **Missing error handling** in critical paths
- **Hardcoded values** that should be configurable
- **Inconsistent naming** conventions

### System Issues
- **Increasing error rates** in logs
- **Degrading performance** over time
- **Memory leaks** or resource exhaustion
- **API rate limiting** or quota issues
- **Network connectivity** problems

### Security Issues
- **Exposed credentials** in logs or code
- **Unencrypted sensitive data** transmission
- **Missing input validation** on user data
- **Inadequate access controls** on resources
- **Outdated dependencies** with known vulnerabilities

---

**Remember**: These rules exist to maintain system reliability, code quality, and project consistency. When in doubt, prioritize system stability over new features, and always test thoroughly before making changes to production systems.

**Last Updated**: September 27, 2025  
**Version**: 1.0  
**Applies to**: All project components and team members

