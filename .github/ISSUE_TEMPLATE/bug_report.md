---
name: Bug Report
about: Report a bug or defect in the Matter platform
title: "[BUG] "
labels: ["bug"]
assignees: "@matter/support-team"
---

## Bug Description
### Title
<!-- Provide a clear and concise bug description -->

### Description
<!-- Provide a detailed description of the bug -->

### Steps to Reproduce
1. <!-- First step -->
2. <!-- Second step -->
3. <!-- Additional steps as needed -->

### Expected Behavior
<!-- Describe what should happen -->

### Actual Behavior
<!-- Describe what actually happens -->

## Environment
### System Details
- Browser: <!-- Choose: [Chrome/Firefox/Safari/Edge] and version -->
- Operating System: 
- Component: <!-- Choose: [User Interface/Map Functionality/Search Service/Planning Service/Authentication/Database/API Gateway/Performance/Security/Other] -->
- API Version: 
- Environment: <!-- Choose: [Production/Staging/Development] -->

## Performance Metrics
<!-- Complete if performance-related issue -->
- Response Time: <!-- in seconds -->
- Error Rate: <!-- in percentage -->
- User Count Affected: 
- System Load: 

## Security Assessment
<!-- Complete for security-related issues -->
- Security Impact: <!-- Choose: [None/Low/Medium/High/Critical] -->
- Data Exposure: <!-- Yes/No -->
- Authentication Affected: <!-- Yes/No -->
- CVE Reference: <!-- If applicable -->

## Impact Assessment
### Severity
<!-- Choose: [Critical/High/Medium/Low] -->

### User Impact
<!-- Describe how this bug affects users -->

### Business Impact
<!-- Describe business implications -->

### SLA Impact
- [ ] This bug affects SLA commitments

## Technical Details
<!-- Add any technical details that might help with debugging -->

## Additional Information
<!-- Any additional context, screenshots, logs, etc. -->

---
<!-- Do not modify below this line -->
/label ~bug
/label ~"severity::${severity}"
/label ~"component::${component}"
<!-- Add if applicable -->
/label ~"sla-breach"
/label ~"security-vulnerability"